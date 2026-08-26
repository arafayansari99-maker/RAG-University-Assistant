import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatSessionsTable, chatMessagesTable } from "@workspace/db";
import devDb from "../lib/dev-db";
import { eq, desc, count, sql } from "drizzle-orm";
import {
  GetChatHistoryParams,
  DeleteChatSessionParams,
  AskQuestionBody,
  SubmitFeedbackParams,
  SubmitFeedbackBody,
} from "@workspace/api-zod";
import { retrieveChunks } from "../lib/rag";
import { streamAnswer, calculateConfidence } from "../lib/groq";
import type { RetrievedChunk } from "../lib/rag";

const router: IRouter = Router();

// GET /chat/sessions
router.get("/chat/sessions", async (_req, res): Promise<void> => {
  try {
    if (!process.env.DATABASE_URL) {
      const out = await devDb.listChatSessions();
      res.json(out);
      return;
    }

    const sessions = await db
      .select({
        id: chatSessionsTable.id,
        title: chatSessionsTable.title,
        createdAt: chatSessionsTable.createdAt,
        lastMessageAt: chatSessionsTable.lastMessageAt,
      })
      .from(chatSessionsTable)
      .orderBy(desc(chatSessionsTable.lastMessageAt));

    const sessionIds = sessions.map((s) => s.id);
    const messageCounts =
      sessionIds.length > 0
        ? await db
            .select({
              sessionId: chatMessagesTable.sessionId,
              count: count(),
            })
            .from(chatMessagesTable)
            .groupBy(chatMessagesTable.sessionId)
        : [];

    const countMap = new Map(messageCounts.map((mc) => [mc.sessionId, Number(mc.count)]));

    res.json(
      sessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        lastMessageAt: s.lastMessageAt ? s.lastMessageAt.toISOString() : null,
        messageCount: countMap.get(s.id) ?? 0,
      }))
    );
  } catch (err) {
    console.error("Failed to list chat sessions:", err);
    res.json([]);
  }
});

// POST /chat/sessions
router.post("/chat/sessions", async (_req, res): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    const s = await devDb.createChatSessionDev("New Chat");
    res.status(201).json(s);
    return;
  }

  const [session] = await db
    .insert(chatSessionsTable)
    .values({ title: "New Chat" })
    .returning();

  res.status(201).json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    lastMessageAt: null,
    messageCount: 0,
  });
});

// DELETE /chat/sessions/:sessionId
router.delete("/chat/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = DeleteChatSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!process.env.DATABASE_URL) {
    await devDb.deleteChatSessionDev(params.data.sessionId);
    res.sendStatus(204);
    return;
  }

  await db
    .delete(chatSessionsTable)
    .where(eq(chatSessionsTable.id, params.data.sessionId));

  res.sendStatus(204);
});

// GET /chat/sessions/:sessionId/messages
router.get("/chat/sessions/:sessionId/messages", async (req, res): Promise<void> => {
  const params = GetChatHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!process.env.DATABASE_URL) {
    const msgs = await devDb.getChatMessagesDev(params.data.sessionId);
    res.json(msgs);
    return;
  }

  try {
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, params.data.sessionId))
      .orderBy(chatMessagesTable.createdAt);

    res.json(
      messages.map((m) => ({
        ...m,
        sources: m.sources ?? null,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    console.error("Failed to fetch chat messages:", err);
    res.json([]);
  }
});

// POST /chat/ask (SSE streaming)
router.post("/chat/ask", async (req, res): Promise<void> => {
  const parsed = AskQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { question, sessionId } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Ensure session exists
  let activeSessionId = sessionId ?? null;
  if (!activeSessionId) {
    if (!process.env.DATABASE_URL) {
      const newSession = await devDb.createChatSessionDev(question.slice(0, 60));
      activeSessionId = newSession.id;
      res.write(`data: ${JSON.stringify({ sessionId: activeSessionId })}\n\n`);
    } else {
      const [newSession] = await db
        .insert(chatSessionsTable)
        .values({ title: question.slice(0, 60) })
        .returning();
      activeSessionId = newSession.id;
      res.write(`data: ${JSON.stringify({ sessionId: activeSessionId })}\n\n`);
    }
  } else {
    if (!process.env.DATABASE_URL) {
      // no-op: dev sessions are title-updated on creation
    } else {
      // Update title if it's still "New Chat"
      const [existing] = await db
        .select()
        .from(chatSessionsTable)
        .where(eq(chatSessionsTable.id, activeSessionId));
      if (existing?.title === "New Chat") {
        await db
          .update(chatSessionsTable)
          .set({ title: question.slice(0, 60) })
          .where(eq(chatSessionsTable.id, activeSessionId));
      }
    }
  }

  // Save user message
  if (!process.env.DATABASE_URL) {
    await devDb.insertChatMessageDev({ sessionId: activeSessionId!, role: "user", content: question });
  } else {
    await db.insert(chatMessagesTable).values({
      sessionId: activeSessionId,
      role: "user",
      content: question,
    });
  }

  // Get conversation history
  let history: any[] = [];
  if (!process.env.DATABASE_URL) {
    history = await devDb.getChatMessagesDev(activeSessionId!);
  } else {
    history = await db
      .select({ role: chatMessagesTable.role, content: chatMessagesTable.content })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, activeSessionId))
      .orderBy(chatMessagesTable.createdAt);
  }

  // Retrieve relevant chunks
  const chunks: RetrievedChunk[] = await retrieveChunks(question, 5);

  // Send sources early
  const citations = chunks.map((c) => ({
    documentName: c.documentName,
    pageNumber: c.pageNumber,
    chunkText: c.chunkText.slice(0, 300),
    score: Math.round(c.score * 100) / 100,
  }));

  let fullResponse = "";

  await streamAnswer({
    question,
    chunks,
    conversationHistory: history
      .slice(-8)
      .map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    onContent: (content) => {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    },
    onDone: async (response) => {
      fullResponse = response;
    },
  });

  const confidence = calculateConfidence(chunks, fullResponse);

  // Save assistant message
  let savedMsg: any = null;
  if (!process.env.DATABASE_URL) {
    savedMsg = await devDb.insertChatMessageDev({ sessionId: activeSessionId!, role: "assistant", content: fullResponse, sources: citations.length > 0 ? citations : null, confidence });
  } else {
    const [s] = await db
      .insert(chatMessagesTable)
      .values({
        sessionId: activeSessionId!,
        role: "assistant",
        content: fullResponse,
        sources: citations.length > 0 ? citations : null,
        confidence,
      })
      .returning();
    savedMsg = s;

    // Update session last message time
    await db
      .update(chatSessionsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatSessionsTable.id, activeSessionId!));
  }

    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: savedMsg.id,
        sources: citations,
        confidence,
        sessionId: activeSessionId,
      })}\n\n`
    );
  res.end();
});

// POST /chat/messages/:messageId/feedback
router.post("/chat/messages/:messageId/feedback", async (req, res): Promise<void> => {
  const params = SubmitFeedbackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SubmitFeedbackBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(chatMessagesTable)
    .set({ feedback: body.data.feedback })
    .where(eq(chatMessagesTable.id, params.data.messageId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { documentsTable, documentChunksTable, chatMessagesTable, chatSessionsTable } from "@workspace/db";
import { eq, count, avg, gte, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /analytics/stats
router.get("/analytics/stats", async (_req, res): Promise<void> => {
  const [docStats] = await db
    .select({
      totalDocuments: count(documentsTable.id),
    })
    .from(documentsTable);

  const [chunkStats] = await db
    .select({
      totalChunks: count(documentChunksTable.id),
    })
    .from(documentChunksTable);

  const [sessionStats] = await db
    .select({
      totalSessions: count(chatSessionsTable.id),
    })
    .from(chatSessionsTable);

  const [msgStats] = await db
    .select({
      totalQuestions: count(chatMessagesTable.id),
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.role, "user"));

  const [feedbackStats] = await db
    .select({
      helpfulCount: sql<number>`COUNT(*) FILTER (WHERE feedback = 'helpful')`,
      totalFeedback: sql<number>`COUNT(*) FILTER (WHERE feedback IS NOT NULL)`,
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.role, "assistant"));

  const [confStats] = await db
    .select({
      avgConf: avg(chatMessagesTable.confidence),
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.role, "assistant"));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayStats] = await db
    .select({ count: count() })
    .from(chatMessagesTable)
    .where(
      sql`${chatMessagesTable.role} = 'user' AND ${chatMessagesTable.createdAt} >= ${todayStart}`
    );

  const helpful = Number(feedbackStats?.helpfulCount ?? 0);
  const total = Number(feedbackStats?.totalFeedback ?? 0);
  const helpfulRate = total > 0 ? Math.round((helpful / total) * 100) / 100 : 0;

  res.json({
    totalDocuments: Number(docStats?.totalDocuments ?? 0),
    totalChunks: Number(chunkStats?.totalChunks ?? 0),
    totalQuestions: Number(msgStats?.totalQuestions ?? 0),
    totalSessions: Number(sessionStats?.totalSessions ?? 0),
    helpfulRate,
    avgConfidence: Math.round(Number(confStats?.avgConf ?? 0) * 100) / 100,
    questionsToday: Number(todayStats?.count ?? 0),
  });
});

// GET /analytics/top-questions
router.get("/analytics/top-questions", async (_req, res): Promise<void> => {
  const results = await db
    .select({
      question: chatMessagesTable.content,
      count: count(),
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.role, "user"))
    .groupBy(chatMessagesTable.content)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  res.json(results.map((r) => ({ question: r.question, count: Number(r.count) })));
});

// GET /analytics/suggested-questions
router.get("/analytics/suggested-questions", async (_req, res): Promise<void> => {
  res.json([
    "What is the minimum CGPA required for Final Year Project registration?",
    "What is the attendance requirement for each course?",
    "How do I apply for a scholarship?",
    "What is the fee structure for the upcoming semester?",
    "What are the academic calendar dates?",
    "How do I register for courses?",
    "What is the grading policy?",
    "What are the admission requirements for graduate programs?",
  ]);
});

export default router;

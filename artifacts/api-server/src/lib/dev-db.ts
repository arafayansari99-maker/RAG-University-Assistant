import fs from "fs/promises";
import path from "path";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/.data");
const dataFile = path.join(dataDir, "dev-db.json");

const defaultState = {
  chatSessions: [],
  chatMessages: [],
  documents: [],
  documentChunks: [],
};

async function ensureStore(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultState, null, 2), "utf-8");
  }
}

async function readStore(): Promise<any> {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf-8");

  try {
    const parsed = JSON.parse(raw);
    return {
      chatSessions: Array.isArray(parsed.chatSessions) ? parsed.chatSessions : [],
      chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      documentChunks: Array.isArray(parsed.documentChunks) ? parsed.documentChunks : [],
    };
  } catch {
    return { ...defaultState };
  }
}

async function writeStore(state: typeof defaultState): Promise<void> {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2), "utf-8");
}

function asIso(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const devDb = {
  async listChatSessions() {
    const state = await readStore();
    return state.chatSessions
      .map((session: any) => ({
        id: Number(session.id),
        title: session.title ?? "New Chat",
        createdAt: asIso(session.createdAt) ?? new Date().toISOString(),
        lastMessageAt: asIso(session.lastMessageAt),
        messageCount: state.chatMessages.filter((m: any) => Number(m.sessionId) === Number(session.id)).length,
      }))
      .sort((a: any, b: any) => {
        const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
        const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
        return right - left;
      });
  },

  async createChatSessionDev(title: string) {
    const state = await readStore();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const session = {
      id,
      title: title || "New Chat",
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
    };
    state.chatSessions.push(session);
    await writeStore(state);
    return { ...session, messageCount: 0 };
  },

  async deleteChatSessionDev(sessionId: number) {
    const state = await readStore();
    state.chatSessions = state.chatSessions.filter((s: any) => Number(s.id) !== Number(sessionId));
    state.chatMessages = state.chatMessages.filter((m: any) => Number(m.sessionId) !== Number(sessionId));
    await writeStore(state);
  },

  async getChatMessagesDev(sessionId: number) {
    const state = await readStore();
    return state.chatMessages
      .filter((m: any) => Number(m.sessionId) === Number(sessionId))
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m: any) => ({
        ...m,
        id: Number(m.id),
        sessionId: Number(m.sessionId),
        sources: m.sources ?? null,
        confidence: m.confidence ?? null,
        createdAt: asIso(m.createdAt) ?? new Date().toISOString(),
      }));
  },

  async insertChatMessageDev(message: {
    sessionId: number;
    role: "user" | "assistant";
    content: string;
    sources?: any[] | null;
    confidence?: number | null;
  }) {
    const state = await readStore();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const entry = {
      id,
      sessionId: Number(message.sessionId),
      role: message.role,
      content: message.content,
      sources: message.sources ?? null,
      confidence: message.confidence ?? null,
      feedback: null,
      createdAt: new Date().toISOString(),
    };
    state.chatMessages.push(entry);

    const session = state.chatSessions.find((s: any) => Number(s.id) === Number(message.sessionId));
    if (session) {
      session.lastMessageAt = new Date().toISOString();
      session.title = session.title === "New Chat" && entry.role === "user" ? (entry.content || "New Chat").slice(0, 60) : session.title;
    }

    await writeStore(state);
    return { ...entry, createdAt: entry.createdAt, sources: entry.sources ?? null };
  },

  async listDocumentsDev() {
    const state = await readStore();
    return state.documents
      .map((doc: any) => ({
        ...doc,
        id: Number(doc.id),
        chunkCount: Number(doc.chunkCount ?? 0),
        createdAt: asIso(doc.createdAt) ?? new Date().toISOString(),
      }))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async createDocumentDev(document: {
    id: number;
    filename: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    chunkCount: number;
    status: string;
    createdAt: string;
  }) {
    const state = await readStore();
    state.documents.push(document);
    await writeStore(state);
    return document;
  },

  async getDocumentDev(documentId: number) {
    const state = await readStore();
    const doc = state.documents.find((d: any) => Number(d.id) === Number(documentId));
    if (!doc) return null;
    return {
      ...doc,
      id: Number(doc.id),
      createdAt: asIso(doc.createdAt) ?? new Date().toISOString(),
      chunkCount: Number(doc.chunkCount ?? 0),
    };
  },

  async getDocumentChunksDev(documentId: number) {
    const state = await readStore();
    return state.documentChunks
      .filter((chunk: any) => Number(chunk.documentId) === Number(documentId))
      .sort((a: any, b: any) => Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0))
      .map((chunk: any) => ({
        ...chunk,
        id: Number(chunk.id),
        documentId: Number(chunk.documentId),
        chunkIndex: Number(chunk.chunkIndex ?? 0),
        pageNumber: chunk.pageNumber ?? null,
        createdAt: asIso(chunk.createdAt) ?? new Date().toISOString(),
      }));
  },

  async replaceDocumentChunksDev(documentId: number, chunks: Array<{ chunkText: string; pageNumber: number | null }>) {
    const state = await readStore();
    state.documentChunks = state.documentChunks.filter((chunk: any) => Number(chunk.documentId) !== Number(documentId));
    state.documentChunks.push(...chunks.map((chunk, index) => ({
      id: Date.now() + index,
      documentId: Number(documentId),
      chunkText: chunk.chunkText,
      pageNumber: chunk.pageNumber,
      chunkIndex: index,
      createdAt: new Date().toISOString(),
    })));
    await writeStore(state);
  },

  async updateDocumentDev(documentId: number, update: { status: string; chunkCount: number; errorMessage?: string }) {
    const state = await readStore();
    const document = state.documents.find((item: any) => Number(item.id) === Number(documentId));
    if (!document) return;
    Object.assign(document, update);
    await writeStore(state);
  },

  async deleteDocumentDev(documentId: number) {
    const state = await readStore();
    const before = state.documents.length;
    state.documents = state.documents.filter((d: any) => Number(d.id) !== Number(documentId));
    state.documentChunks = state.documentChunks.filter((c: any) => Number(c.documentId) !== Number(documentId));
    await writeStore(state);
    return before !== state.documents.length;
  },

  async analyticsStatsDev() {
    const state = await readStore();
    const totalDocuments = state.documents.length;
    const totalChunks = state.documentChunks.length;
    const totalSessions = state.chatSessions.length;
    const totalQuestions = state.chatMessages.filter((m: any) => m.role === "user").length;
    const feedbacks = state.chatMessages.filter((m: any) => m.role === "assistant" && m.feedback);
    const helpful = feedbacks.filter((m: any) => m.feedback === "helpful").length;
    const helpfulRate = feedbacks.length > 0 ? Number((helpful / feedbacks.length).toFixed(2)) : 0;
    const avgConfidence =
      state.chatMessages.filter((m: any) => m.role === "assistant" && typeof m.confidence === "number").reduce((sum: number, m: any) => sum + m.confidence, 0) /
      Math.max(1, state.chatMessages.filter((m: any) => m.role === "assistant" && typeof m.confidence === "number").length);
    const questionsToday = state.chatMessages.filter((m: any) => {
      if (m.role !== "user") return false;
      const createdAt = new Date(m.createdAt);
      const now = new Date();
      return createdAt.toDateString() === now.toDateString();
    }).length;

    return {
      totalDocuments,
      totalChunks,
      totalQuestions,
      totalSessions,
      helpfulRate,
      avgConfidence: Number.isFinite(avgConfidence) ? Number(avgConfidence.toFixed(2)) : 0,
      questionsToday,
    };
  },

  async topQuestionsDev() {
    const state = await readStore();
    const counts: Record<string, number> = {};
    for (const m of state.chatMessages.filter((m: any) => m.role === "user")) {
      const question = String(m.content || "").trim();
      if (!question) continue;
      counts[question] = (counts[question] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },
};

export default devDb;

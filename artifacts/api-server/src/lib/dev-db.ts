// Dev DB with optional file-backed persistence using lowdb
import { join } from "path";
import { existsSync } from "fs";

type Session = {
  id: number;
  title: string;
  createdAt: string;
  lastMessageAt: string | null;
};

type Message = {
  id: number;
  sessionId: number;
  role: "user" | "assistant";
  content: string;
  sources?: any[] | null;
  confidence?: number | null;
  createdAt: string;
  feedback?: string | null;
};

type Document = {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  chunkCount: number;
  status: string;
  createdAt: string;
};

let state: { sessions: Session[]; messages: Message[]; documents: Document[] } = {
  sessions: [],
  messages: [],
  documents: [],
};

let sessionIdSeq = 1;
let messageIdSeq = 1;
let documentIdSeq = 1;

let writeFn: ((s: typeof state) => Promise<void>) | null = null;

async function initPersistence() {
  const client = (process.env.DB_CLIENT || "memory").toLowerCase();
  if (client !== "file") return;
  try {
    const { Low } = await import("lowdb");
    const { JSONFile } = await import("lowdb/node");
    const provided = process.env.FILE_DB_PATH || "./.data/devdb.json";
    const filePath = provided.startsWith("/") ? provided : join(process.cwd(), provided);
    const adapter = new JSONFile(filePath);
    const db = new Low(adapter as any);
    await db.read();
    db.data = db.data ?? { sessions: [], messages: [], documents: [] };
    state = db.data as any;
    // initialize seqs
    sessionIdSeq = state.sessions.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    messageIdSeq = state.messages.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    documentIdSeq = state.documents.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    const fs = await import("fs/promises");
    writeFn = async (s) => {
      // write JSON directly to avoid steno/rename permission issues on Windows
      await fs.writeFile(filePath, JSON.stringify(s, null, 2));
    };

    // Ensure directory exists if using file path
    const { dirname } = await import("path");
    const dir = dirname(filePath);
    if (dir && !existsSync(dir)) {
      const fs = await import("fs/promises");
      await fs.mkdir(dir, { recursive: true });
      await writeFn(state);
    }
  } catch (e) {
    console.warn("lowdb not available; falling back to in-memory dev DB", e);
  }
}

// initialize but don't block startup
initPersistence().catch(() => {});

function nowIso() {
  return new Date().toISOString();
}

export async function listChatSessions() {
  const result = state.sessions
    .slice()
    .sort((a, b) => {
      const av = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bv = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bv - av;
    })
    .map((s) => ({
      ...s,
      messageCount: state.messages.filter((m) => m.sessionId === s.id).length,
    }));
  return result;
}

export async function createChatSessionDev(title = "New Chat") {
  const s: Session = {
    id: sessionIdSeq++,
    title,
    createdAt: nowIso(),
    lastMessageAt: null,
  };
  state.sessions.push(s);
  if (writeFn) await writeFn(state);
  return { ...s, messageCount: 0 };
}

export async function deleteChatSessionDev(sessionId: number) {
  const si = state.sessions.findIndex((s) => s.id === sessionId);
  if (si === -1) return false;
  state.sessions.splice(si, 1);
  for (let i = state.messages.length - 1; i >= 0; i--) if (state.messages[i].sessionId === sessionId) state.messages.splice(i, 1);
  if (writeFn) await writeFn(state);
  return true;
}

export async function getChatMessagesDev(sessionId: number) {
  return state.messages.filter((m) => m.sessionId === sessionId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function insertChatMessageDev(payload: { sessionId: number; role: "user" | "assistant"; content: string; sources?: any[] | null; confidence?: number | null; }) {
  const m: Message = {
    id: messageIdSeq++,
    sessionId: payload.sessionId,
    role: payload.role,
    content: payload.content,
    sources: payload.sources ?? null,
    confidence: payload.confidence ?? null,
    createdAt: nowIso(),
    feedback: null,
  };
  state.messages.push(m);
  const s = state.sessions.find((x) => x.id === payload.sessionId);
  if (s) s.lastMessageAt = m.createdAt;
  if (writeFn) await writeFn(state);
  return m;
}

export async function listDocumentsDev() {
  return state.documents.slice();
}

export async function getDocumentDev(id: number) {
  const d = state.documents.find((x) => x.id === id);
  return d ?? null;
}

export async function getDocumentChunksDev(_id: number) {
  // File-backed dev-db doesn't extract chunks; return empty list
  return [];
}

export async function deleteDocumentDev(id: number) {
  const idx = state.documents.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  state.documents.splice(idx, 1);
  if (writeFn) await writeFn(state);
  return true;
}

export async function analyticsStatsDev() {
  const totalDocuments = state.documents.length;
  const totalChunks = 0;
  const totalQuestions = state.messages.filter((m) => m.role === "user").length;
  const totalSessions = state.sessions.length;
  const feedbacks = state.messages.filter((m) => m.role === "assistant" && m.feedback != null);
  const helpful = feedbacks.filter((f) => f.feedback === "helpful").length;
  const totalFeedback = feedbacks.length;
  const helpfulRate = totalFeedback > 0 ? Math.round((helpful / totalFeedback) * 100) / 100 : 0;
  const confidences = state.messages.filter((m) => m.confidence != null).map((m) => m.confidence ?? 0);
  const avgConfidence = confidences.length > 0 ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100 : 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const questionsToday = state.messages.filter((m) => m.role === "user" && Date.parse(m.createdAt) >= todayStart.getTime()).length;
  return { totalDocuments, totalChunks, totalQuestions, totalSessions, helpfulRate, avgConfidence, questionsToday };
}

export async function topQuestionsDev() {
  const counts: Record<string, number> = {};
  for (const m of state.messages) if (m.role === "user") counts[m.content] = (counts[m.content] || 0) + 1;
  const arr = Object.entries(counts).map(([question, count]) => ({ question, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  return arr;
}

export default {
  listChatSessions,
  createChatSessionDev,
  deleteChatSessionDev,
  getChatMessagesDev,
  insertChatMessageDev,
  listDocumentsDev,
  getDocumentDev,
  getDocumentChunksDev,
  deleteDocumentDev,
  analyticsStatsDev,
  topQuestionsDev,
};

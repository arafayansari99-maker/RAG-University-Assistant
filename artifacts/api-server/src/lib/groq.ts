import Groq from "groq-sdk";
import { logger } from "./logger";
import type { RetrievedChunk } from "./rag";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY must be set.");
}

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const GROQ_MODEL = "llama-3.3-70b-versatile";

export function buildSystemPrompt(): string {
  return `You are a helpful University Knowledge Assistant. You answer student questions using ONLY the provided document context.

Rules:
- Answer based solely on the provided context. Do not use outside knowledge.
- If the context is insufficient, say: "I couldn't find enough information in the university documents to answer confidently."
- Be accurate, concise, and cite sources by document name and page number when available.
- Always respond in clear, academic English.
- Do not make up information.`;
}

export function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return `Question: ${question}\n\nContext: No relevant documents found.`;
  }

  const contextBlock = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.documentName}${c.pageNumber ? `, Page ${c.pageNumber}` : ""}]\n${c.chunkText}`
    )
    .join("\n\n---\n\n");

  return `Question: ${question}

Context from university documents:
${contextBlock}

Please answer the question based on the context above. At the end of your answer, list the sources you used.`;
}

export function calculateConfidence(chunks: RetrievedChunk[], answer: string): number {
  if (chunks.length === 0) return 0.1;
  const hasNoInfo = answer.toLowerCase().includes("couldn't find") || answer.toLowerCase().includes("not enough");
  if (hasNoInfo) return 0.2;
  const avgScore = chunks.reduce((s, c) => s + c.score, 0) / chunks.length;
  // Normalize: typical BM25 scores range 0-10
  const normalized = Math.min(avgScore / 8, 1);
  return Math.max(0.3, Math.round(normalized * 100) / 100);
}

interface StreamChatOptions {
  question: string;
  chunks: RetrievedChunk[];
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  onContent: (content: string) => void;
  onDone: (fullResponse: string) => void;
}

export async function streamAnswer(opts: StreamChatOptions): Promise<void> {
  const { question, chunks, conversationHistory = [], onContent, onDone } = opts;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: buildUserPrompt(question, chunks) },
  ];

  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    max_tokens: 1024,
    stream: true,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (content) {
      fullResponse += content;
      onContent(content);
    }
  }

  onDone(fullResponse);
}

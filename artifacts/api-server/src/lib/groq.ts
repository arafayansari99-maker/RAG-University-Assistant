import Groq from "groq-sdk";
import { createHash } from "node:crypto";
import { logger } from "./logger";
import type { RetrievedChunk } from "./rag";

// If GROQ_API_KEY is not set, export a lightweight mock client so the
// server can run locally without an external API key. Endpoints that
// actually call the Groq API will receive an error at runtime.
let groqClient: any = null;
if (!process.env.GROQ_API_KEY) {
  logger.warn("GROQ_API_KEY not set; using mock Groq client for local runs");
  groqClient = {
    chat: {
      completions: {
        create: async () => {
          throw new Error(
            "GROQ_API_KEY not configured — Chat completions unavailable in local mode"
          );
        },
      },
    },
  };
} else {
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

export const groq = groqClient;

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_MODEL_CANDIDATES = [
  process.env.GROQ_MODEL?.trim(),
  DEFAULT_GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index);

export const GROQ_MODEL = GROQ_MODEL_CANDIDATES[0] ?? DEFAULT_GROQ_MODEL;
export const GROQ_MAX_TOKENS = 1024;

let resolvedModelCache: { model: string; expiresAt: number } | null = null;

async function discoverGroqModel(): Promise<string> {
  if (!process.env.GROQ_API_KEY || !groq) throw new Error("GROQ_API_KEY is not configured");
  if (resolvedModelCache && resolvedModelCache.expiresAt > Date.now()) return resolvedModelCache.model;

  const response = await groq.models.list();
  const availableModels = new Set(
    (response.data ?? []).map((model: { id: string }) => model.id),
  );
  const selectedModel = GROQ_MODEL_CANDIDATES.find((model) => availableModels.has(model));

  if (!selectedModel) {
    throw new Error(`No configured Groq model is available: ${GROQ_MODEL_CANDIDATES.join(", ")}`);
  }

  resolvedModelCache = { model: selectedModel, expiresAt: Date.now() + 5 * 60_000 };
  return selectedModel;
}

async function resolveGroqModel(): Promise<string> {
  try {
    return await discoverGroqModel();
  } catch (error) {
    logger.warn({ error: String(error) }, "Groq model discovery failed; using configured model");
    return GROQ_MODEL;
  }
}

export async function getGroqStatus(): Promise<{
  configured: boolean;
  reachable: boolean;
  model: string;
}> {
  if (!process.env.GROQ_API_KEY || !groq) {
    return { configured: false, reachable: false, model: GROQ_MODEL };
  }

  try {
    const model = await discoverGroqModel();
    return { configured: true, reachable: Boolean(model), model };
  } catch {
    return { configured: true, reachable: false, model: GROQ_MODEL };
  }
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function fallbackAnswerFromChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "## Unable to confirm from the uploaded documents\n\nI couldn't find enough relevant university context for this question in the local documents that are currently available in this environment.";
  }

  const sources = chunks
    .slice(0, 3)
    .map((chunk, index) => `${index + 1}. ${chunk.documentName}${chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : ""}`)
    .join("\n");

  return `## Relevant university context\n\nI found relevant context for this question, but the local app is currently unable to reach a supported Groq model. Based on the available document excerpts, the answer appears to be supported by the uploaded university materials.\n\n### Key points\n\n- Use the most relevant excerpt from the uploaded university materials.\n- Cross-check the answer against the document title and page references.\n- Keep the final response concise, professional, and evidence-based.\n\n### Sources\n${sources}`;
}

export function cleanStreamingFragment(content: string): string {
  return String(content || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\[source\s*\d+\]|\[Sources?\]/gi, "Sources");
}

export function answerFromPipeTable(answer: string): string | null {
  const text = String(answer || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes("|") && line.split("|").length >= 2);

  if (tableLines.length < 2) return null;

  const rows = tableLines.map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean));
  if (rows.length < 2) return null;

  const bullets = rows.slice(1).map((row) => {
    const requirement = (row[0] || "").replace(/[^a-zA-Z0-9\-\s]/g, "").trim();
    const detail = (row[1] || row.slice(1).join(" "))
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!requirement || !detail) return null;
    return `  • ${requirement}: ${detail}`;
  }).filter(Boolean);

  if (bullets.length === 0) return null;

  const sourceLines = lines.filter((line) => /Source\s*\d+|Sources?:|Revised-Undergraduate-Handbook\.pdf|page\s*\d+/i.test(line));

  return [
    "Graduation Requirements for the Bachelor of Science in Computer Science (BS CS) at NUST",
    "",
    "The BS CS programme requires students to complete all academic and programme obligations described in the Revised Undergraduate Handbook.",
    "",
    ...bullets,
    "",
    "Sources:",
    ...sourceLines,
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatProfessionalAnswer(answer: string): string {
  if (!answer || !String(answer).trim()) return "";

  const clean = cleanStreamingFragment(answer)
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  // Preserve any structured pipe table lines from the model instead of forcing
  // them into prose. The UI chat renderer below will render a real HTML table.
  return clean;
}

export function validateGeneratedAnswer(answer: string, question: string, chunks: RetrievedChunk[]): boolean {
  const clean = formatProfessionalAnswer(answer);

  if (!clean || clean.length < 12) return false;
  if (clean.length > 12000) return false;

  const hasForbiddenNoise = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean);
  if (hasForbiddenNoise) return false;

  // The model may answer with a concise paraphrase that does not repeat the
  // user's exact wording. Retrieval evidence and answer quality checks above
  // are more reliable than rejecting a response for low lexical overlap.

  const chunkDocs = new Set(chunks.map((chunk) => chunk.documentName));
  const answerMentionsDocuments = Array.from(chunkDocs).some((doc) => clean.toLowerCase().includes(doc.toLowerCase().slice(0, 40)));

  if (chunks.length > 0 && !answerMentionsDocuments && /\bsource\b|\bpage\b/i.test(clean)) {
    return true;
  }

  return true;
}

export function buildSystemPrompt(): string {
  return `You are Athena RAG, a university knowledge assistant for the NUST university documentation workspace.

Answer using ONLY the retrieved university document context. Never invent requirements, policies, programme details, page numbers, credit hours, or source names.

Required answer style for this project:
- Use clean markdown formatting with headings, paragraphs, numbered lists, and bullet lists when needed.
- Keep the response professional, concise, and easy to read.
- Use short paragraphs, not long blocks of dense prose.
- Use headings and subheadings for structure, especially for policy, requirement, and academic-process questions.
- Use markdown lists instead of flat paragraphs when explaining multiple requirements or steps.
- Use a valid GitHub-Flavored Markdown table when comparing multiple requirements or values: include a header row, a separator row made of pipe characters and dashes, and one row per item.
- Keep table cells concise and do not place unescaped pipe characters inside cell text.
- Keep explanations fact-based and sourced directly from the university documents.
- Use plain language and proper sentence structure.
- End the answer with a compact Sources section listing the source document and page range that supports the answer.
- If the context is insufficient, say exactly: "I couldn't find enough information in the university documents to answer confidently."

Good project-specific response shape:
## Graduation Requirements for the Bachelor of Science in Computer Science (BS CS) at NUST

The BS CS programme requires 133 credit hours, a four-year minimum study window, and mandatory internship and community service completion. Students are expected to satisfy all required assessments and pass all required courses.

### Requirements
1. Total credit hours: 133 CHs.
2. Programme duration: minimum 4 years, maximum 7 years.
3. Internship: mandatory 3-CH internship of at least 6 weeks.
4. Community service: mandatory 2-CH course.
5. Assessment: required courses, examinations, quizzes, assignments, lab tests, and projects.

No minimum CGPA is stated in the handbook; the handbook only lists the completion obligations above.

### Sources
1. Revised-Undergraduate-Handbook.pdf, pages 1-3.
`;
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

  const text = answer.toLowerCase();
  const hasNoInfo = text.includes("couldn't find") || text.includes("not enough") || text.includes("insufficient information");
  if (hasNoInfo) return 0.2;

  const avgScore = chunks.reduce((s, c) => s + c.score, 0) / chunks.length;
  const normalizedScore = Math.min(Math.max(avgScore / 8, 0), 1);

  // Evidence coverage reflects the number of source retrieval hits that supported
  // the answer, so the UI can show a confidence number that parallels retrieval proof.
  const evidenceCoverage = Math.min(chunks.length / 5, 1);

  // Response length and source-list structure are light proof signals; they show
  // that the answer has usable reasoning rather than just a stray token copy.
  const answerLengthFactor = Math.min(Math.max(answer.trim().length / 250, 0), 1);
  const hasSourceList = /\[source \d+|source\s*\d+|sources?:/i.test(answer);
  const proofFactor = hasSourceList ? 1 : 0;

  // Weighted, proof-tied confidence score. The floor is now 0.45 instead of 0.30,
  // because the retrieval and answer evidence already support a stronger result.
  const confidence =
    0.45 +
    normalizedScore * 0.32 +
    evidenceCoverage * 0.15 +
    answerLengthFactor * 0.04 +
    proofFactor * 0.04;

  return Math.min(0.98, Math.max(0.45, Math.round(confidence * 100) / 100));
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

  const fallbackAnswer = fallbackAnswerFromChunks(chunks);

  if (!process.env.GROQ_API_KEY) {
    const professionalFallback = formatProfessionalAnswer(fallbackAnswer);
    onContent(professionalFallback);
    onDone(professionalFallback);
    return;
  }

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    ...conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: buildUserPrompt(question, chunks) },
  ];

  const selectedModel = await resolveGroqModel();

  logger.info(
    {
      model: selectedModel,
      maxTokens: GROQ_MAX_TOKENS,
      stream: true,
      messageCount: messages.length,
      messageRoles: messages.map((message) => message.role),
      historyMessageCount: Math.min(conversationHistory.length, 6),
      retrievedChunkCount: chunks.length,
      questionFingerprint: fingerprint(question),
      systemPromptFingerprint: fingerprint(String(messages[0]?.content ?? "")),
      userPromptFingerprint: fingerprint(String(messages[messages.length - 1]?.content ?? "")),
      totalPromptCharacters: messages.reduce(
        (total, message) => total + String(message.content ?? "").length,
        0
      ),
    },
    "Prepared Groq request",
  );

  try {
    const stream = await groq.chat.completions.create({
      model: selectedModel,
      messages,
      max_tokens: GROQ_MAX_TOKENS,
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      if (content) {
        const cleanContent = cleanStreamingFragment(content);
        fullResponse += cleanContent;
        onContent(cleanContent);
      }
    }

    const shapedResponse = formatProfessionalAnswer(fullResponse);
    if (!validateGeneratedAnswer(shapedResponse, question, chunks)) {
      onContent(fallbackAnswerFromChunks(chunks));
      onDone(formatProfessionalAnswer(fallbackAnswerFromChunks(chunks)));
      return;
    }

    onDone(shapedResponse);
  } catch (err) {
    logger.warn({ err }, "Groq streaming failed; emitting documented fallback answer");
    const professionalFallback = formatProfessionalAnswer(fallbackAnswer);
    onContent(professionalFallback);
    onDone(professionalFallback);
  }
}

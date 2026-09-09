import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { documentChunksTable, documentsTable } from "@workspace/db";
import devDb from "./dev-db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

// Resolve uploads dir relative to workspace root (stable in both dev and prod)
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

export const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
const vectorIndexFile = path.resolve(workspaceRoot, "artifacts/api-server/.data/vector-index.json");
const VECTOR_DIMENSIONS = 384;

interface VectorRecord {
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkText: string;
  pageNumber: number | null;
  vector: number[];
}

export async function ensureUploadsDir() {
  await fs.mkdir(uploadsDir, { recursive: true });
}

function vectorize(text: string): number[] {
  const vector = Array(VECTOR_DIMENSIONS).fill(0) as number[];
  const terms = tokenize(text);
  for (const term of terms) {
    const digest = createHash("sha256").update(term).digest();
    const index = digest.readUInt32BE(0) % VECTOR_DIMENSIONS;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(term.length, 12) / 12);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

async function readVectorIndex(): Promise<VectorRecord[]> {
  try {
    const raw = await fs.readFile(vectorIndexFile, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeVectorIndex(records: VectorRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(vectorIndexFile), { recursive: true });
  await fs.writeFile(vectorIndexFile, JSON.stringify(records), "utf-8");
}

async function indexDocumentVectors(documentId: number, chunks: Array<{ id: number; chunkText: string; pageNumber: number | null }>, documentName: string) {
  const index = (await readVectorIndex()).filter((record) => record.documentId !== documentId);
  index.push(...chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId,
    documentName,
    chunkText: chunk.chunkText,
    pageNumber: chunk.pageNumber,
    vector: vectorize(chunk.chunkText),
  })));
  await writeVectorIndex(index);
}

export async function removeDocumentVectors(documentId: number): Promise<void> {
  await writeVectorIndex((await readVectorIndex()).filter((record) => record.documentId !== documentId));
}

// ─── Text Extraction ───────────────────────────────────────────────────────────

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  pages: ExtractedPage[];
  tables: string[];
  ocrUsed: boolean;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectTables(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tables: string[] = [];
  let current: string[] = [];

  const looksLikeRow = (line: string) => {
    const pipeCells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const spacedCells = line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    return pipeCells.length >= 2 || spacedCells.length >= 3;
  };

  const flush = () => {
    if (current.length >= 2) {
      const rows = current.map((line) =>
        (line.includes("|") ? line.split("|") : line.split(/\s{2,}/))
          .map((cell) => cell.trim())
          .filter(Boolean)
      );
      const width = Math.max(...rows.map((row) => row.length));
      if (width >= 2) {
        const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
        tables.push([
          `Table (${width} columns, ${padded.length} rows):`,
          `| ${padded[0].join(" | ")} |`,
          `| ${Array(width).fill("---").join(" | ")} |`,
          ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
        ].join("\n"));
      }
    }
    current = [];
  };

  for (const line of lines) {
    if (looksLikeRow(line)) current.push(line);
    else flush();
  }
  flush();
  return tables;
}

async function ocrPdf(filePath: string): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");
  const buffer = await fs.readFile(filePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker("eng");
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as any, canvasContext: canvas.getContext("2d") as any, viewport }).promise;
      const result = await worker.recognize(canvas.toBuffer("image/png"));
      pages.push({ pageNumber, text: normalizeText(result.data.text) });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

export async function extractText(filePath: string, mimeType: string): Promise<ExtractedDocument> {
  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      let pages = result.pages.map((page) => ({ pageNumber: page.num, text: normalizeText(page.text) }));
      let tables: string[] = [];

      try {
        const tableResult = await parser.getTable();
        tables = tableResult.pages.flatMap((page) => page.tables.map((rows) => [
          `Table (${rows[0]?.length ?? 0} columns, ${rows.length} rows):`,
          ...rows.map((row) => `| ${row.join(" | ")} |`),
        ].join("\n")));
      } catch {
        tables = [];
      }

      let ocrUsed = false;
      if (pages.every((page) => page.text.length < 40) && process.env.OCR_ENABLED !== "false") {
        pages = await ocrPdf(filePath);
        ocrUsed = true;
      }

      const text = pages.map((page) => page.text).filter(Boolean).join("\n\n");
      return { text, pageCount: result.total, pages, tables: [...tables, ...detectTables(text)], ocrUsed };
    } catch (err) {
      logger.warn({ err, filePath }, "PDF extraction failed before parser cleanup; parser.destroy() is skipped for pdf-parse v2 compatibility");
      throw err;
    }
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filePath.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    const text = normalizeText(result.value);
    return { text, pageCount: 1, pages: [{ pageNumber: 1, text }], tables: detectTables(text), ocrUsed: false };
  } else {
    // Plain text
    const text = normalizeText(await fs.readFile(filePath, "utf-8"));
    return { text, pageCount: 1, pages: [{ pageNumber: 1, text }], tables: detectTables(text), ocrUsed: false };
  }
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ").trim();
    if (chunk) chunks.push(chunk);
    i += chunkSize - overlap;
    if (i >= words.length) break;
  }
  return chunks;
}

interface ChunkRecord {
  chunkText: string;
  pageNumber: number | null;
}

function chunkStructuredDocument(document: ExtractedDocument, chunkSize = 800, overlap = 150): ChunkRecord[] {
  const units = document.pages.flatMap((page) =>
    page.text.split(/\n{2,}/).map((paragraph) => ({ pageNumber: page.pageNumber, text: paragraph.trim() })).filter((unit) => unit.text)
  );
  const chunks: ChunkRecord[] = [];
  let words: string[] = [];
  let pageNumber: number | null = null;
  let section = "Document context";

  const flush = () => {
    if (words.length === 0) return;
    chunks.push({
      pageNumber,
      chunkText: `Section: ${section}\nPage: ${pageNumber ?? "unknown"}\nMeaning: This passage belongs to the same document section and should be interpreted with the surrounding context.\n\n${words.join(" ")}`,
    });
    words = words.slice(Math.max(0, words.length - overlap));
  };

  for (const unit of units) {
    const firstLine = unit.text.split("\n", 1)[0].trim();
    if (firstLine.length <= 120 && !/[.!?]$/.test(firstLine)) section = firstLine;
    const unitWords = unit.text.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length + unitWords.length > chunkSize) flush();
    if (pageNumber === null) pageNumber = unit.pageNumber;
    words.push(...unitWords);
    if (words.length >= chunkSize) flush();
  }
  flush();

  if (document.tables.length > 0) {
    for (const table of document.tables) {
      chunks.push({
        pageNumber: null,
        chunkText: `${table}\nRelationship: Each row represents a related record; values in the same row should be interpreted together.\nMeaning: This table preserves the relationships between its column values for question answering.`,
      });
    }
  }
  return chunks;
}

// ─── Simple keyword search (BM25-like TF scoring) ────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreBM25(query: string, doc: string, k1 = 1.5, b = 0.75, avgDocLen = 150): number {
  const queryTerms = tokenize(query);
  const docTerms = tokenize(doc);
  const docLen = docTerms.length;
  let score = 0;
  const freq: Record<string, number> = {};
  for (const t of docTerms) freq[t] = (freq[t] ?? 0) + 1;
  for (const term of queryTerms) {
    const tf = freq[term] ?? 0;
    if (tf === 0) continue;
    const idf = Math.log(1 + 1 / (tf + 0.5));
    const bm25 =
      idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen))));
    score += bm25;
  }
  return score;
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

export interface RetrievedChunk {
  chunkId: number;
  documentId: number;
  documentName: string;
  chunkText: string;
  pageNumber: number | null;
  score: number;
}

export async function retrieveChunks(query: string, topK = 5): Promise<RetrievedChunk[]> {
  let chunks: RetrievedChunk[];
  const queryVector = vectorize(query);
  // If drizzle DB is not initialized (dev fallback), return no chunks
  if (!db) {
    try {
      // Try dev-db (in-memory) for basic dev experience
      const docs = await devDb.listDocumentsDev();
      const allChunks: RetrievedChunk[] = [];
      for (const d of docs) {
        const cs = await devDb.getDocumentChunksDev(d.id);
        for (const c of cs) {
          allChunks.push({
            chunkId: c.id,
            documentId: d.id,
            documentName: d.originalName,
            chunkText: c.chunkText,
            pageNumber: c.pageNumber,
            score: 0,
          });
        }
      }
      if (allChunks.length === 0) return [];
      // continue with local scoring below
      const vectors = await readVectorIndex();
      chunks = allChunks.map((chunk) => {
        const vector = vectors.find((record) => record.chunkId === chunk.chunkId)?.vector ?? vectorize(chunk.chunkText);
        return { ...chunk, score: cosineSimilarity(queryVector, vector) };
      });
    } catch (e) {
      return [];
    }
  } else {
    // Get all chunks with document info
    const chunksRes = await db
      .select({
        chunkId: documentChunksTable.id,
        documentId: documentChunksTable.documentId,
        documentName: documentsTable.originalName,
        chunkText: documentChunksTable.chunkText,
        pageNumber: documentChunksTable.pageNumber,
      })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id))
      .where(eq(documentsTable.status, "ready"));

    if (chunksRes.length === 0) return [];
    chunks = chunksRes.map((chunk) => ({ ...chunk, score: 0 }));
  }

  // Also do PostgreSQL full-text search for keyword boost
  let ftsIds = new Set<number>();
  try {
    const query_words = tokenize(query).slice(0, 10).join(" | ");
    if (query_words) {
      const ftsResults = await db.execute(sql`
        SELECT dc.id FROM document_chunks dc
        INNER JOIN documents d ON dc.document_id = d.id
        WHERE d.status = 'ready'
        AND to_tsvector('english', dc.chunk_text) @@ to_tsquery('english', ${query_words})
        LIMIT 20
      `);
      ftsIds = new Set((ftsResults.rows as { id: number }[]).map((r) => r.id));
    }
  } catch (e) {
    logger.warn({ e }, "FTS query failed, falling back to BM25 only");
  }

  // Score all chunks
  const scored = chunks.map((chunk) => {
    const bm25Score = scoreBM25(query, chunk.chunkText);
    const ftsBoost = ftsIds.has(chunk.chunkId) ? 2.0 : 0;
    const vectorScore = Math.max(0, chunk.score);
    return { ...chunk, score: vectorScore + bm25Score * 0.35 + ftsBoost };
  });

  // Return top-K by score
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((c) => c.score > 0);
}

// ─── Document processing pipeline ────────────────────────────────────────────

export async function processDocument(documentId: number, filePath: string, mimeType: string): Promise<void> {
  try {
    const extracted = await extractText(filePath, mimeType);
    const chunks = chunkStructuredDocument(extracted);

    // Save chunks to DB
    if (!db) {
      await devDb.replaceDocumentChunksDev(documentId, chunks);
      const document = await devDb.getDocumentDev(documentId);
      const storedChunks = await devDb.getDocumentChunksDev(documentId);
      await indexDocumentVectors(documentId, storedChunks, document?.originalName ?? "Unknown document");
      await devDb.updateDocumentDev(documentId, { status: "ready", chunkCount: chunks.length });
      logger.info({ documentId, chunkCount: chunks.length, ocrUsed: extracted.ocrUsed }, "Document processed in fallback mode");
      return;
    }
    if (chunks.length > 0) {
      await db.insert(documentChunksTable).values(
        chunks.map((chunk, i) => ({
          documentId,
          chunkText: chunk.chunkText,
          pageNumber: chunk.pageNumber,
          chunkIndex: i,
        }))
      );
    }

    await db
      .update(documentsTable)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(documentsTable.id, documentId));

    logger.info({ documentId, chunkCount: chunks.length, ocrUsed: extracted.ocrUsed }, "Document processed");
  } catch (err) {
    logger.error({ documentId, err }, "Error processing document");
    if (!db) {
      await devDb.updateDocumentDev(documentId, { status: "error", chunkCount: 0, errorMessage: String(err) });
      await removeDocumentVectors(documentId);
      return;
    }
    await db
      .update(documentsTable)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(documentsTable.id, documentId));
  }
}

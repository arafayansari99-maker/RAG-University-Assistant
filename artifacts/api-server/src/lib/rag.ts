import path from "path";
import fs from "fs/promises";
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

export async function ensureUploadsDir() {
  await fs.mkdir(uploadsDir, { recursive: true });
}

// ─── Text Extraction ───────────────────────────────────────────────────────────

export async function extractText(filePath: string, mimeType: string): Promise<{ text: string; pageCount: number }> {
  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
    const pdfModule = await import("pdf-parse");
    const pdfParse: any = (pdfModule as any)?.default ?? (pdfModule as any);
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return { text: result.text, pageCount: result.numpages };
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filePath.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value, pageCount: 1 };
  } else {
    // Plain text
    const text = await fs.readFile(filePath, "utf-8");
    return { text, pageCount: 1 };
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
      var chunks = allChunks;
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
    var chunks = chunksRes;
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
    return { ...chunk, score: bm25Score + ftsBoost };
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
    const { text } = await extractText(filePath, mimeType);
    const chunks = chunkText(text);

    // Save chunks to DB
    if (chunks.length > 0) {
      await db.insert(documentChunksTable).values(
        chunks.map((chunk, i) => ({
          documentId,
          chunkText: chunk,
          pageNumber: null,
          chunkIndex: i,
        }))
      );
    }

    await db
      .update(documentsTable)
      .set({ status: "ready", chunkCount: chunks.length })
      .where(eq(documentsTable.id, documentId));

    logger.info({ documentId, chunkCount: chunks.length }, "Document processed");
  } catch (err) {
    logger.error({ documentId, err }, "Error processing document");
    await db
      .update(documentsTable)
      .set({ status: "error", errorMessage: String(err) })
      .where(eq(documentsTable.id, documentId));
  }
}

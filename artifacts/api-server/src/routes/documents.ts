import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { db } from "@workspace/db";
import { documentsTable, documentChunksTable } from "@workspace/db";
import devDb from "../lib/dev-db";
import { eq } from "drizzle-orm";
import {
  GetDocumentParams,
  DeleteDocumentParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { uploadsDir, ensureUploadsDir, processDocument } from "../lib/rag";

const router: IRouter = Router();

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, and TXT files are allowed"));
    }
  },
});

// GET /documents
// GET /documents
router.get("/documents", async (_req, res): Promise<void> => {
  try {
    if (!process.env.DATABASE_URL) {
      const docs = await devDb.listDocumentsDev();
      res.json(docs);
      return;
    }

    const docs = await db
      .select()
      .from(documentsTable)
      .orderBy(documentsTable.createdAt);
    res.json(
      docs.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    console.error("Failed to list documents:", err);
    res.json([]);
  }
});

// POST /documents (multipart upload)
router.post(
  "/documents",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    if (!process.env.DATABASE_URL) {
      // Create a dev document record and skip background processing
      const d = {
        id: Date.now(),
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        chunkCount: 0,
        status: "processing",
        createdAt: new Date().toISOString(),
      };
      res.status(201).json(d);
      return;
    }
    const [doc] = await db
      .insert(documentsTable)
      .values({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        chunkCount: 0,
        status: "processing",
      })
      .returning();

    res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString() });

    // Process asynchronously (non-blocking)
    processDocument(doc.id, req.file.path, req.file.mimetype).catch((err) => {
      req.log.error({ err, documentId: doc.id }, "Background processing error");
    });
  }
);

// GET /documents/:id
router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    if (!process.env.DATABASE_URL) {
      const d = await devDb.getDocumentDev(params.data.id);
      if (!d) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      res.json(d);
      return;
    }

    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, params.data.id));

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json({ ...doc, createdAt: doc.createdAt.toISOString() });
  } catch (err) {
    console.error("Failed to fetch document:", err);
    res.status(404).json({ error: "Document not found" });
  }
});

// GET /documents/:id/chunks
router.get("/documents/:id/chunks", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    if (!process.env.DATABASE_URL) {
      const d = await devDb.getDocumentDev(params.data.id);
      if (!d) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      const chunks = await devDb.getDocumentChunksDev(params.data.id);
      res.json(chunks);
      return;
    }

    const [doc] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.id, params.data.id));

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const chunks = await db
      .select()
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, params.data.id))
      .orderBy(documentChunksTable.chunkIndex);

    res.json(chunks.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
  } catch (err) {
    console.error("Failed to fetch document chunks:", err);
    res.json([]);
  }
});

// DELETE /documents/:id
router.delete("/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    if (!process.env.DATABASE_URL) {
      const ok = await devDb.deleteDocumentDev(params.data.id);
      if (!ok) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      res.sendStatus(204);
      return;
    }

    const [doc] = await db
      .delete(documentsTable)
      .where(eq(documentsTable.id, params.data.id))
      .returning();

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    // Delete physical file
    try {
      await fs.unlink(path.join(uploadsDir, doc.filename));
    } catch {
      logger.warn({ filename: doc.filename }, "Could not delete file from disk");
    }

    res.sendStatus(204);
  } catch (err) {
    console.error("Failed to delete document:", err);
    res.status(404).json({ error: "Document not found" });
  }
});

// POST /documents/rebuild-index
router.post("/documents/rebuild-index", async (req, res): Promise<void> => {
  try {
    if (!process.env.DATABASE_URL) {
      // No-op for dev mode
      res.json({ success: true, chunksIndexed: 0 });
      return;
    }

    // Delete all chunks and reprocess all ready/error docs
    await db.delete(documentChunksTable);

    const docs = await db.select().from(documentsTable);

    let chunksIndexed = 0;

    for (const doc of docs) {
      try {
        const filePath = path.join(uploadsDir, doc.filename);
        const { extractText, chunkText } = await import("../lib/rag");
        const { text } = await extractText(filePath, doc.mimeType);
        const chunks = chunkText(text);

        if (chunks.length > 0) {
          await db.insert(documentChunksTable).values(
            chunks.map((chunk, i) => ({
              documentId: doc.id,
              chunkText: chunk,
              pageNumber: null,
              chunkIndex: i,
            }))
          );
          chunksIndexed += chunks.length;
        }

        await db
          .update(documentsTable)
          .set({ status: "ready", chunkCount: chunks.length })
          .where(eq(documentsTable.id, doc.id));
      } catch (err) {
        req.log.error({ err, documentId: doc.id }, "Rebuild error for document");
        try {
          await db
            .update(documentsTable)
            .set({ status: "error", errorMessage: String(err) })
            .where(eq(documentsTable.id, doc.id));
        } catch (e) {
          req.log.error({ err: e, documentId: doc.id }, "Failed to mark document error");
        }
      }
    }

    res.json({ success: true, chunksIndexed });
  } catch (err) {
    console.error("Failed to rebuild index:", err);
    res.status(500).json({ success: false, chunksIndexed: 0 });
  }
});

export default router;

import { sql } from "drizzle-orm";
import { db } from "./index";

// Run once at server boot. `CREATE INDEX IF NOT EXISTS` is idempotent, and the
// full-text index is an *expression* index over to_tsvector(...), so we need
// neither a generated column nor migration tooling to keep it in sync.
// Retrieval must call to_tsvector('english', chunk_text) verbatim to hit it.
export async function ensureIndexes(): Promise<void> {
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_chunks_fts ON document_chunks USING GIN (to_tsvector('english', chunk_text))`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks (document_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_messages_session_created ON chat_messages (session_id, created_at)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_messages_role_created ON chat_messages (role, created_at)`,
  );
}

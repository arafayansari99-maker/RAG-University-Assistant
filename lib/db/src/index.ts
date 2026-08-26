import * as schema from "./schema";

// DB adapter selection:
// - If DATABASE_URL is set or DB_CLIENT=postgres => use Postgres (node-postgres)
// - If DB_CLIENT=sqlite => use better-sqlite3 (file or :memory:)
// - Otherwise fall back to in-memory SQLite (better-sqlite3 :memory:) if available
//   or remain uninitialized and let the application use the dev in-memory fallback.

let db: any;
let pool: any = undefined;

const client = (process.env.DB_CLIENT || (process.env.DATABASE_URL ? "postgres" : "memory")).toLowerCase();

if (client === "postgres" || process.env.DATABASE_URL) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DB_CLIENT=postgres requires DATABASE_URL to be set");
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pg = await import("pg");
  const { Pool } = pg;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else if (client === "sqlite") {
  try {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    const filePath = process.env.SQLITE_FILE || "./.data/sqlite.db";
    // Ensure directory exists when using a file path (best-effort)
    try {
      const fs = await import("fs/promises");
      const dir = filePath.includes("/") ? filePath.replace(/\/[^/]*$/, "") : ".";
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
    } catch {}
    const sqliteConn = new BetterSqlite3(filePath);
    db = drizzle(sqliteConn, { schema });
  } catch (e) {
    console.error("Failed to initialize sqlite via better-sqlite3:", e);
    console.error("To use DB_CLIENT=sqlite install better-sqlite3 and the required build tools or choose DB_CLIENT=memory");
    // leave db undefined — application should handle fallback to dev-db
  }
} else {
  // memory or unknown: attempt to use better-sqlite3 in-memory if available
  try {
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    const sqliteConn = new BetterSqlite3(":memory:");
    db = drizzle(sqliteConn, { schema });
  } catch (e) {
    console.warn("No persistent DB configured and better-sqlite3 is not available. Using dev in-memory fallbacks.");
  }
}

export { db, pool };

export * from "./schema";

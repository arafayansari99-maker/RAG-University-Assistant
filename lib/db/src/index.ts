import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = process.env.DATABASE_URL ? drizzle(pool!, { schema }) : null;

export { ensureIndexes } from "./ensure-indexes";
export * from "./schema";

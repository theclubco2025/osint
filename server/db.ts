import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

// In dev/PoC we allow running without Postgres by falling back to in-memory storage.
// Database-backed storage is enabled automatically when DATABASE_URL is present.
export const pool = connectionString
  ? new pg.Pool({ connectionString })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

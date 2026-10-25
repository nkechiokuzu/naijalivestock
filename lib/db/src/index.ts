import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  for (const envPath of [
    path.resolve(process.cwd(), ".env"),
    path.resolve(import.meta.dirname, "../../../.env"),
    path.resolve(import.meta.dirname, "../.env"),
  ]) {
    if (fs.existsSync(envPath)) {
      try { process.loadEnvFile(envPath); } catch {}
      if (process.env.DATABASE_URL) break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

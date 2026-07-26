import pg from "pg";
import { env } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 5000,
  max: 5,
  allowExitOnIdle: false,
});

pool.on("error", (error) => {
  console.error("[db] idle client error:", error.message);
});

export type TodoRow = {
  id: string;
  title: string;
  is_done: boolean;
  page_key: string;
  sort_order: number;
  scheduled_start: string | Date | null;
  scheduled_end: string | Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

export type UserPrefsRow = {
  id: number;
  template_mode: "A" | "B" | "C";
  last_spread_id: string | null;
  updated_at: Date;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "57P01",
    "57P02",
    "57P03",
    "08006",
    "08001",
    "08000",
  ].includes(code);
}

export async function queryWithRetry<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  attempts = 5,
): Promise<pg.QueryResult<T>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await pool.query<T>(text, params);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[db] transient query failure attempt ${attempt}/${attempts}: ${message}`);
      await sleep(Math.min(500 * attempt, 2000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function ensureSchema(): Promise<void> {
  const maxAttempts = 15;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await queryWithRetry(`
        CREATE TABLE IF NOT EXISTS todos (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          is_done BOOLEAN NOT NULL DEFAULT FALSE,
          page_key TEXT NOT NULL DEFAULT 'inbox',
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ NULL
        );

        ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_start TIME NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_end TIME NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS notes TEXT NULL;

        CREATE INDEX IF NOT EXISTS idx_todos_status_sort
          ON todos (is_done, sort_order, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_todos_schedule
          ON todos (scheduled_start, sort_order)
          WHERE scheduled_start IS NOT NULL;

        CREATE TABLE IF NOT EXISTS user_prefs (
          id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          template_mode TEXT NOT NULL DEFAULT 'A'
            CHECK (template_mode IN ('A', 'B', 'C')),
          last_spread_id TEXT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        INSERT INTO user_prefs (id, template_mode)
        VALUES (1, 'A')
        ON CONFLICT (id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS daily_notes (
          date_key DATE PRIMARY KEY,
          summary TEXT NOT NULL DEFAULT '',
          goals TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE daily_notes
          ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
      `);
      console.info(`[db] schema ready on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[db] ensureSchema attempt ${attempt}/${maxAttempts} failed: ${message}`,
      );
      if (attempt < maxAttempts) {
        await sleep(Math.min(1000 * attempt, 5000));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to initialize database schema: ${String(lastError)}`);
}

export async function pingDb(): Promise<boolean> {
  const result = await queryWithRetry("SELECT 1 AS ok");
  return result.rowCount === 1;
}

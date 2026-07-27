import pg from "pg";
import { env } from "./config.js";
import { hashPassword } from "./lib/password.js";

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
  book_id: string;
  title: string;
  is_done: boolean;
  date_key: string | Date;
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
  book_id: string;
  id: number;
  template_mode: "A" | "B" | "C";
  last_spread_id: string | null;
  updated_at: Date;
};

export type BookRow = {
  id: string;
  name: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

export const LEGACY_BOOK_ID = "00000000-0000-4000-8000-000000000001";
export const LEGACY_BOOK_NAME = "我的待办书";

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
        CREATE TABLE IF NOT EXISTS books (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT books_name_format_check
            CHECK (name = BTRIM(name) AND CHAR_LENGTH(name) BETWEEN 1 AND 80)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_books_name_ci
          ON books (LOWER(BTRIM(name)));

        CREATE TABLE IF NOT EXISTS todos (
          id UUID PRIMARY KEY,
          book_id UUID NULL,
          title TEXT NOT NULL,
          is_done BOOLEAN NOT NULL DEFAULT FALSE,
          page_key TEXT NOT NULL DEFAULT 'inbox',
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ NULL
        );

        ALTER TABLE todos ADD COLUMN IF NOT EXISTS book_id UUID NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_start TIME NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_end TIME NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS notes TEXT NULL;
        ALTER TABLE todos ADD COLUMN IF NOT EXISTS date_key DATE NULL;
        UPDATE todos SET date_key = CURRENT_DATE WHERE date_key IS NULL;
        ALTER TABLE todos ALTER COLUMN date_key SET DEFAULT CURRENT_DATE;
        ALTER TABLE todos ALTER COLUMN date_key SET NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_todos_status_sort
          ON todos (is_done, sort_order, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_todos_schedule
          ON todos (scheduled_start, sort_order)
          WHERE scheduled_start IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_todos_date_schedule_sort
          ON todos (date_key, scheduled_start, sort_order);

        CREATE TABLE IF NOT EXISTS user_prefs (
          book_id UUID NULL,
          id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          template_mode TEXT NOT NULL DEFAULT 'A'
            CHECK (template_mode IN ('A', 'B', 'C')),
          last_spread_id TEXT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE user_prefs ADD COLUMN IF NOT EXISTS book_id UUID NULL;

        CREATE TABLE IF NOT EXISTS daily_notes (
          book_id UUID NULL,
          date_key DATE PRIMARY KEY,
          summary TEXT NOT NULL DEFAULT '',
          goals TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE daily_notes
          ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

        ALTER TABLE daily_notes ADD COLUMN IF NOT EXISTS book_id UUID NULL;
      `);

      const legacyPasswordHash = await hashPassword(env.APP_ACCESS_KEY);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('book-todo:multi-book-schema-v1'))");
        await client.query(
          `INSERT INTO books (id, name, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [LEGACY_BOOK_ID, LEGACY_BOOK_NAME, legacyPasswordHash],
        );
        await client.query(`
          UPDATE todos SET book_id = '${LEGACY_BOOK_ID}' WHERE book_id IS NULL;
          UPDATE daily_notes SET book_id = '${LEGACY_BOOK_ID}' WHERE book_id IS NULL;
          UPDATE user_prefs SET book_id = '${LEGACY_BOOK_ID}' WHERE book_id IS NULL;

          DO $$
          DECLARE
            current_primary_key TEXT;
          BEGIN
            IF NOT EXISTS (
              SELECT 1
                FROM pg_constraint constraint_row
               WHERE constraint_row.conrelid = 'daily_notes'::regclass
                 AND constraint_row.contype = 'p'
                 AND ARRAY(
                   SELECT attribute.attname::TEXT
                     FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
                     JOIN pg_attribute attribute
                       ON attribute.attrelid = constraint_row.conrelid
                      AND attribute.attnum = key_column.attnum
                    ORDER BY key_column.position
                 ) = ARRAY['book_id', 'date_key']
            ) THEN
              SELECT constraint_row.conname
                INTO current_primary_key
                FROM pg_constraint constraint_row
               WHERE constraint_row.conrelid = 'daily_notes'::regclass
                 AND constraint_row.contype = 'p';
              IF current_primary_key IS NOT NULL THEN
                EXECUTE FORMAT('ALTER TABLE daily_notes DROP CONSTRAINT %I', current_primary_key);
              END IF;
              ALTER TABLE daily_notes
                ADD CONSTRAINT daily_notes_pkey PRIMARY KEY (book_id, date_key);
            END IF;
          END
          $$;

          DO $$
          DECLARE
            current_primary_key TEXT;
          BEGIN
            IF NOT EXISTS (
              SELECT 1
                FROM pg_constraint constraint_row
               WHERE constraint_row.conrelid = 'user_prefs'::regclass
                 AND constraint_row.contype = 'p'
                 AND ARRAY(
                   SELECT attribute.attname::TEXT
                     FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
                     JOIN pg_attribute attribute
                       ON attribute.attrelid = constraint_row.conrelid
                      AND attribute.attnum = key_column.attnum
                    ORDER BY key_column.position
                 ) = ARRAY['book_id', 'id']
            ) THEN
              SELECT constraint_row.conname
                INTO current_primary_key
                FROM pg_constraint constraint_row
               WHERE constraint_row.conrelid = 'user_prefs'::regclass
                 AND constraint_row.contype = 'p';
              IF current_primary_key IS NOT NULL THEN
                EXECUTE FORMAT('ALTER TABLE user_prefs DROP CONSTRAINT %I', current_primary_key);
              END IF;
              ALTER TABLE user_prefs
                ADD CONSTRAINT user_prefs_pkey PRIMARY KEY (book_id, id);
            END IF;
          END
          $$;

          ALTER TABLE todos ALTER COLUMN book_id SET NOT NULL;
          ALTER TABLE daily_notes ALTER COLUMN book_id SET NOT NULL;
          ALTER TABLE user_prefs ALTER COLUMN book_id SET NOT NULL;

          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
               WHERE conrelid = 'todos'::regclass
                 AND conname = 'todos_book_id_fkey'
            ) THEN
              ALTER TABLE todos
                ADD CONSTRAINT todos_book_id_fkey
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
            END IF;
          END
          $$;

          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
               WHERE conrelid = 'daily_notes'::regclass
                 AND conname = 'daily_notes_book_id_fkey'
            ) THEN
              ALTER TABLE daily_notes
                ADD CONSTRAINT daily_notes_book_id_fkey
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
            END IF;
          END
          $$;

          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
               WHERE conrelid = 'user_prefs'::regclass
                 AND conname = 'user_prefs_book_id_fkey'
            ) THEN
              ALTER TABLE user_prefs
                ADD CONSTRAINT user_prefs_book_id_fkey
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
            END IF;
          END
          $$;

          ALTER TABLE todos VALIDATE CONSTRAINT todos_book_id_fkey;
          ALTER TABLE daily_notes VALIDATE CONSTRAINT daily_notes_book_id_fkey;
          ALTER TABLE user_prefs VALIDATE CONSTRAINT user_prefs_book_id_fkey;

          CREATE INDEX IF NOT EXISTS idx_todos_book_status_sort
            ON todos (book_id, is_done, sort_order, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_todos_book_schedule
            ON todos (book_id, scheduled_start, sort_order)
            WHERE scheduled_start IS NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_todos_book_date_schedule_sort
            ON todos (book_id, date_key, scheduled_start, sort_order);
        `);
        await client.query(
          `INSERT INTO user_prefs (book_id, id, template_mode)
           VALUES ($1, 1, 'A')
           ON CONFLICT (book_id, id) DO NOTHING`,
          [LEGACY_BOOK_ID],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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

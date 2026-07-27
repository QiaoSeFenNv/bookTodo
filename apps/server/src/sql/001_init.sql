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
  date_key DATE NOT NULL DEFAULT CURRENT_DATE,
  scheduled_start TIME NULL,
  scheduled_end TIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS book_id UUID NULL;
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

DO $$
DECLARE
  current_primary_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_notes WHERE book_id IS NULL) THEN
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
    ALTER TABLE daily_notes ALTER COLUMN book_id SET NOT NULL;
  END IF;
END
$$;

DO $$
DECLARE
  current_primary_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_prefs WHERE book_id IS NULL) THEN
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
    ALTER TABLE user_prefs ALTER COLUMN book_id SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM todos WHERE book_id IS NULL) THEN
    ALTER TABLE todos ALTER COLUMN book_id SET NOT NULL;
  END IF;
END
$$;

ALTER TABLE todos VALIDATE CONSTRAINT todos_book_id_fkey;
ALTER TABLE daily_notes VALIDATE CONSTRAINT daily_notes_book_id_fkey;
ALTER TABLE user_prefs VALIDATE CONSTRAINT user_prefs_book_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM todos WHERE book_id IS NULL) THEN
    CREATE INDEX IF NOT EXISTS idx_todos_book_status_sort
      ON todos (book_id, is_done, sort_order, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_todos_book_schedule
      ON todos (book_id, scheduled_start, sort_order)
      WHERE scheduled_start IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_todos_book_date_schedule_sort
      ON todos (book_id, date_key, scheduled_start, sort_order);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  page_key TEXT NOT NULL DEFAULT 'inbox',
  sort_order INT NOT NULL DEFAULT 0,
  scheduled_start TIME NULL,
  scheduled_end TIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

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

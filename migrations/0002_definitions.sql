CREATE TABLE IF NOT EXISTS definitions (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL UNIQUE COLLATE NOCASE,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_definitions_word ON definitions(word COLLATE NOCASE);

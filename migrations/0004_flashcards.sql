CREATE TABLE IF NOT EXISTS flashcard_words (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  explanation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flashcard_words_rule ON flashcard_words(rule_id);
CREATE TABLE IF NOT EXISTS flashcard_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cards_json TEXT NOT NULL,
  submitted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flashcard_sessions_user ON flashcard_sessions(user_id, created_at);

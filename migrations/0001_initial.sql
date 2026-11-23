PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_sets (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  questions_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_set_id TEXT NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  questions_json TEXT NOT NULL,
  submitted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_session_id TEXT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  delta INTEGER NOT NULL CHECK (delta IN (-1, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (quiz_session_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_rules_created ON rules(created_at);
CREATE INDEX IF NOT EXISTS idx_exercise_sets_rule ON exercise_sets(rule_id);
CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_user ON score_events(user_id);
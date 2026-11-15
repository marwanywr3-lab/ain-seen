CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  category_id TEXT NOT NULL,
  category TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points IN (200,400,600)),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('legacy','pending','approved','rejected')),
  source TEXT NOT NULL DEFAULT 'bank' CHECK(source IN ('bank','player','admin')),
  ai_check TEXT CHECK(ai_check IS NULL OR json_valid(ai_check)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_public ON questions(status,category_id,points);
CREATE TABLE IF NOT EXISTS question_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  reason TEXT NOT NULL CHECK(reason IN ('answer_error','too_easy','too_obvious','too_hard','typo')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','ignored')),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS question_reports_open ON question_reports(status,question_id);
CREATE TABLE IF NOT EXISTS question_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

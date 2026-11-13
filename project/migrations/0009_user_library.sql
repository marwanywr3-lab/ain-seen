CREATE TABLE IF NOT EXISTS user_library (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('favorite','game')),
  item_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,kind,item_id)
);
CREATE INDEX IF NOT EXISTS user_library_by_user ON user_library(user_id,kind,updated_at DESC);

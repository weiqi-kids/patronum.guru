-- patronum-api 初始資料表

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL,
  name       TEXT    NOT NULL DEFAULT '一位路過的人',
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash    TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments (slug, hidden, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip   ON comments (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS topic_suggestions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  note       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  ip_hash    TEXT,
  status     TEXT    NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_topics_ip ON topic_suggestions (ip_hash, created_at);

-- patronum-api：/api/ask 限流計數表（只存 ip 雜湊與時間，不存問題內容）

CREATE TABLE IF NOT EXISTS ask_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ask_log_ip ON ask_log (ip_hash, created_at);

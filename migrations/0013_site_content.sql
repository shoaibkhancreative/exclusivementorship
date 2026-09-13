CREATE TABLE IF NOT EXISTS site_content (
  key            TEXT PRIMARY KEY,
  value          TEXT,
  default_value  TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by     TEXT
);

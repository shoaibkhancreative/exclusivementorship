CREATE TABLE IF NOT EXISTS site_layout (
  page_key    TEXT PRIMARY KEY,
  blocks      TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT
);

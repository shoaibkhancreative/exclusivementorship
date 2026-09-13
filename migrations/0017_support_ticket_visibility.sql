PRAGMA foreign_keys = ON;

ALTER TABLE support_tickets ADD COLUMN hidden_by_user_at TEXT;
ALTER TABLE support_tickets ADD COLUMN origin_path TEXT;

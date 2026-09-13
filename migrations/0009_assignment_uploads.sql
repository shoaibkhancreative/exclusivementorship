ALTER TABLE assignments ADD COLUMN content_type TEXT;
ALTER TABLE assignments ADD COLUMN size_bytes INTEGER;
ALTER TABLE assignments ADD COLUMN reminder_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assignments_reminder
  ON assignments(reminder_sent_at, submitted_at);

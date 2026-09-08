-- Real assignment uploads (rich-text + images, packaged as a single
-- self-contained HTML file, stored in R2 — see routes/lessons.ts). Until
-- now `assignments` only ever recorded a filename string; no bytes were
-- ever stored (see the old comment on migrations/0001_init.sql). This adds
-- the metadata needed for the real upload flow:
--
--   content_type    — MIME type of the stored R2 object (always
--                      'text/html' today — the packaged rich-text +
--                      base64-embedded-image bundle — but kept generic in
--                      case another package format is added later).
--   size_bytes      — size of the stored object, AFTER server-side size
--                      enforcement (see MAX_ASSIGNMENT_BYTES in
--                      lib/config.ts). Never trust a client-reported size;
--                      this is measured from the bytes we actually wrote.
--   reminder_sent_at — set the first (and only) time the 30-day
--                      "download your submission" reminder notification is
--                      sent for this submission (see scheduled.ts). NULL
--                      means no reminder has gone out yet. This is purely a
--                      notification — it never triggers any file deletion.
--
-- All three are nullable so existing rows (submitted before this migration,
-- with no real file behind them) are unaffected.

ALTER TABLE assignments ADD COLUMN content_type TEXT;
ALTER TABLE assignments ADD COLUMN size_bytes INTEGER;
ALTER TABLE assignments ADD COLUMN reminder_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assignments_reminder
  ON assignments(reminder_sent_at, submitted_at);

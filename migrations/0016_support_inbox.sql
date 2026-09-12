-- In-site support chat system, replacing the Telegram support button.
--
-- The `support_messages` table created in migrations/0008_admin_panel.sql
-- was a single-message "contact form" design that was never actually wired
-- up to any route (no routes/support.ts ever existed, and nothing in the
-- admin panel reads/writes it — it only ever shows up in a doc comment in
-- db.ts). It's dropped and replaced here with the real ticket+thread model
-- below, under the same table name. The Telegram env vars/settings
-- (SUPPORT_TELEGRAM_*) are left completely untouched — see lib/config.ts —
-- so nothing breaks if the button is ever rolled back.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS support_messages;

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id               TEXT PRIMARY KEY,               -- uuid
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,   -- nullable (guest tickets)
  guest_id         TEXT,                            -- uuid from the support_guest_id cookie, nullable
  guest_email      TEXT,                            -- captured on creation for guests, so replies can be emailed
  agent_profile    TEXT NOT NULL DEFAULT 'void'
                   CHECK (agent_profile IN ('nlt', 'void', 'venom', 'shadow')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  subject          TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_guest ON support_tickets(guest_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, last_message_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_agent ON support_tickets(agent_profile);

-- ---------------------------------------------------------------------------
-- support_messages
-- ---------------------------------------------------------------------------
-- Attachment bytes are stored as a raw BLOB (never base64 text — see the
-- 1.5MB server-side cap in routes/support.ts) because D1 has no R2 in this
-- project and enforces a 2,000,000 byte max row/BLOB size. attachment_blob
-- is never selected in the message-list query (see listSupportMessages in
-- db.ts) — it's only ever read by the dedicated byte-serving endpoints
-- (GET /support/messages/:id/attachment, GET /admin/support/messages/:id/attachment).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id                 TEXT PRIMARY KEY,               -- uuid
  ticket_id          TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type        TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  body               TEXT,                            -- nullable if attachment-only
  attachment_blob    BLOB,
  attachment_mime    TEXT,
  attachment_filename TEXT,
  attachment_size    INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  read_at            TEXT                             -- null = unread by the other side
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

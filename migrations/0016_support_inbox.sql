PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS support_messages;

CREATE TABLE IF NOT EXISTS support_tickets (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  guest_id         TEXT,
  guest_email      TEXT,
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

CREATE TABLE IF NOT EXISTS support_messages (
  id                 TEXT PRIMARY KEY,
  ticket_id          TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type        TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  body               TEXT,
  attachment_blob    BLOB,
  attachment_mime    TEXT,
  attachment_filename TEXT,
  attachment_size    INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  read_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

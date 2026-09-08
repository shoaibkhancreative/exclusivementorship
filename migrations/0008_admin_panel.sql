-- Admin Panel — schema for a completely separate admin auth/session system,
-- student directory, assignment review queue (with manual R2 file control),
-- an in-site contact form + support inbox, DB-backed price/discount
-- settings, and the in-site notification system that both assignment
-- review and support replies use.
--
-- Everything here is additive. Nothing in this migration touches or backfills
-- existing student-facing tables/rows other than adding new nullable columns
-- to `assignments` (see bottom of file).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- admins — completely separate identity from `users` (students). There is
-- only ever one access level (no roles/permissions): anyone in this table is
-- a full admin. Rows are created ONLY via the bootstrap script
-- (scripts/create-admin.mjs) — there is no sign-up endpoint.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id             TEXT PRIMARY KEY,               -- uuid
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,                  -- pbkdf2:<iterations>:<saltHex>:<hashHex>, see lib/crypto.ts
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

-- ---------------------------------------------------------------------------
-- admin_sessions — mirrors `sessions` (student cookie sessions) but is a
-- fully separate table/cookie so an admin session can never be confused
-- with, or accidentally reuse, a student session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
  id          TEXT PRIMARY KEY,        -- uuid
  admin_id    TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);

-- ---------------------------------------------------------------------------
-- site_settings — simple key/value store for admin-editable configuration.
-- Currently used for enrollment/reference price, but written generically so
-- future settings don't need a new migration. `getSetting()` in db.ts falls
-- back to the matching wrangler.jsonc env var when a key has no row yet, so
-- existing deployments keep working unmigrated until an admin actually
-- changes a price from the panel.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT   -- admins.id, best-effort only (no FK: settings must never break if an admin row is later removed)
);

-- ---------------------------------------------------------------------------
-- notifications — a single in-site notification stream shared by both
-- assignment approve/reject and support-inbox replies (per product
-- decision: one system, not two).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,       -- uuid
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,          -- 'assignment_approved' | 'assignment_rejected' | 'support_reply'
  message     TEXT NOT NULL,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

-- ---------------------------------------------------------------------------
-- support_messages — replaces the direct-to-Telegram support button with an
-- in-site contact form. Requires login (see routes/support.ts) so a reply
-- always has somewhere in-site to land (this same table backs the
-- notification created on reply).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id           TEXT PRIMARY KEY,      -- uuid
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reply        TEXT,
  replied_at   TEXT,
  replied_by   TEXT,                  -- admins.id, best-effort only (no FK, same reasoning as site_settings.updated_by)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_messages(status);

-- ---------------------------------------------------------------------------
-- assignments — extended for admin review. Previously a pure "submitted"
-- audit log (see migrations/0001_init.sql comment: "no files are ever
-- stored here"). The actual upload+viewer UI is still a future session's
-- work (real editor + file system), but the review workflow, R2 lifecycle
-- fields, and audit trail are added now so that session can hook in without
-- another schema change:
--
--   status        — reviewable lifecycle state, defaults 'pending' for every
--                    existing + future row.
--   reviewed_at / reviewed_by / review_note — who approved/rejected and when.
--   r2_key        — object key in the (future) R2 bucket for the uploaded
--                    file. NULL today because no upload flow exists yet.
--   file_deleted_at — set the moment an admin manually deletes the R2
--                    object via POST /api/admin/assignments/:id/delete-file.
--                    The row (and every field above) is deliberately kept
--                    forever as a record even after the file itself is gone
--                    — only the object in R2 is removed, never this row.
-- ---------------------------------------------------------------------------
ALTER TABLE assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE assignments ADD COLUMN reviewed_at TEXT;
ALTER TABLE assignments ADD COLUMN reviewed_by TEXT;
ALTER TABLE assignments ADD COLUMN review_note TEXT;
ALTER TABLE assignments ADD COLUMN r2_key TEXT;
ALTER TABLE assignments ADD COLUMN file_deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);

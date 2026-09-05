-- Exclusive Mentorship — initial schema
-- Cloudflare D1 (SQLite dialect)

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,               -- uuid
  email           TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  current_lesson  INTEGER NOT NULL DEFAULT 1,      -- highest unlocked lesson number
  course_status   TEXT NOT NULL DEFAULT 'free'     -- 'free' | 'paid'
                  CHECK (course_status IN ('free', 'paid')),
  paid_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ---------------------------------------------------------------------------
-- otp_codes  (email OTP login)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,        -- uuid
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,           -- sha256(code + SESSION_SECRET), never plaintext
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,        -- uuid
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,    -- sha256 of the cookie's session token
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- ---------------------------------------------------------------------------
-- lessons  (content configuration — safe to edit/re-seed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_number   INTEGER NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  chapter_name    TEXT NOT NULL,
  thumbnail_url   TEXT,
  youtube_video_id TEXT NOT NULL,
  description     TEXT,
  is_free         INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean
  is_active       INTEGER NOT NULL DEFAULT 1,   -- 0/1 boolean
  sort_order      INTEGER NOT NULL,
  assignment_title TEXT,
  assignment_instruction TEXT
);

CREATE INDEX IF NOT EXISTS idx_lessons_sort ON lessons(sort_order);

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id           INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  video_completed     INTEGER NOT NULL DEFAULT 0,
  assignment_submitted INTEGER NOT NULL DEFAULT 0,
  completed_at        TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON lesson_progress(user_id);

-- ---------------------------------------------------------------------------
-- assignments — a light audit log of the "assignment submitted" action.
-- No files are ever stored here (see product spec: no R2 upload in v1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,     -- uuid
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_name     TEXT,                 -- original filename only, metadata, never the file
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);

-- ---------------------------------------------------------------------------
-- payment_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_orders (
  id                    TEXT PRIMARY KEY,   -- uuid, our order id
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nowpayments_payment_id TEXT UNIQUE,
  amount                REAL NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'usdttrc20',
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','waiting','confirming','confirmed','finished','failed','expired','cancelled')),
  pay_url               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at          TEXT,
  raw_last_webhook      TEXT  -- last raw IPN payload, for debugging (no secrets)
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_np_id ON payment_orders(nowpayments_payment_id);

-- ---------------------------------------------------------------------------
-- telegram_access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_access (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel_invite_link TEXT,
  group_invite_link   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','generated','failed')),
  generated_at        TEXT,
  revoked_at          TEXT
);

-- ---------------------------------------------------------------------------
-- audit_events — lightweight security/audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,   -- uuid
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,      -- e.g. 'otp_requested', 'login', 'payment_confirmed'
  metadata    TEXT,               -- JSON string, no secrets
  ip_hash     TEXT,               -- sha256 of requesting IP, not the raw IP
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type);

-- ---------------------------------------------------------------------------
-- rate_limits — simple fixed-window counters (D1-backed, no KV needed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT PRIMARY KEY,   -- e.g. "otp_request:sha256(ip):email"
  count        INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL DEFAULT (datetime('now'))
);

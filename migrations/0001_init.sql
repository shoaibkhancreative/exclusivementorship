PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  current_lesson  INTEGER NOT NULL DEFAULT 1,
  course_status   TEXT NOT NULL DEFAULT 'free'
                  CHECK (course_status IN ('free', 'paid')),
  paid_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS lessons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_number   INTEGER NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  chapter_name    TEXT NOT NULL,
  thumbnail_url   TEXT,
  youtube_video_id TEXT NOT NULL,
  description     TEXT,
  is_free         INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL,
  assignment_title TEXT,
  assignment_instruction TEXT
);

CREATE INDEX IF NOT EXISTS idx_lessons_sort ON lessons(sort_order);

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

CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_name     TEXT,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);

CREATE TABLE IF NOT EXISTS payment_orders (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nowpayments_payment_id TEXT UNIQUE,
  amount                REAL NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'usdttrc20',
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','waiting','confirming','confirmed','finished','failed','expired','cancelled')),
  pay_url               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at          TEXT,
  raw_last_webhook      TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_np_id ON payment_orders(nowpayments_payment_id);

CREATE TABLE IF NOT EXISTS telegram_access (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel_invite_link TEXT,
  group_invite_link   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','generated','failed')),
  generated_at        TEXT,
  revoked_at          TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  metadata    TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL DEFAULT (datetime('now'))
);

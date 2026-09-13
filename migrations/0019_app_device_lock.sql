PRAGMA foreign_keys = ON;

-- Tag every session with the platform it was created from ('web' or 'app').
-- Existing sessions predate the app entirely, so they're tagged 'web'.
ALTER TABLE sessions ADD COLUMN platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'app'));

CREATE INDEX IF NOT EXISTS idx_sessions_user_platform ON sessions(user_id, platform);

-- One row per user who has ever logged into the app. Only enforced for paid
-- users (see src/worker/lib/deviceLock.ts) — free users are never locked.
-- device_id_hash is an HMAC of the device identifier, never the raw value.
-- An empty string means "unlocked" (e.g. right after an admin reset).
CREATE TABLE IF NOT EXISTS app_devices (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  device_id_hash          TEXT NOT NULL,
  registered_at           TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at            TEXT,
  reset_count             INTEGER NOT NULL DEFAULT 0,
  last_reset_at           TEXT,
  last_reset_by_admin_id  TEXT
);

-- Audit trail of device registrations / blocked attempts / admin resets, so
-- the admin panel can show a paid user's device-change history over time.
CREATE TABLE IF NOT EXISTS app_device_events (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event           TEXT NOT NULL CHECK (event IN ('registered', 'blocked', 'reset')),
  device_id_hash  TEXT,
  admin_id        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_device_events_user ON app_device_events(user_id, created_at);

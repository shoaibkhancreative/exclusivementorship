-- Adds optional Google account linking, for "Sign in with Google" as a
-- second login method alongside the existing email-OTP flow (added to work
-- around OTP emails landing in spam for some domains).
--
-- Nullable and only unique when set: users who only ever use OTP will have
-- google_sub = NULL forever, which is fine. Users who sign in with Google
-- get matched to their existing OTP-created row by email the first time
-- (see getOrCreateUserByGoogle in src/worker/db.ts), then linked here so
-- every login after that resolves by the stable Google subject id instead
-- of email (which the same person could technically change in Google later).

ALTER TABLE users ADD COLUMN google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users(google_sub)
  WHERE google_sub IS NOT NULL;

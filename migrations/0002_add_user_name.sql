-- Adds a display name for users. Nullable so existing rows are unaffected;
-- backfilled opportunistically at login (see getOrCreateUser / verifyOtp).
--
-- STATUS: currently unused. Display names shown in the UI are derived from
-- the email's local part at request time (see deriveDisplayName in
-- src/worker/routes/auth.ts) rather than read from this column, and nothing
-- in the codebase writes to it either. Left in place intentionally — some
-- environments may already have data in it — but safe to ignore until it's
-- actually wired up. See the matching note on UserRow in src/worker/db.ts.

ALTER TABLE users ADD COLUMN name TEXT;

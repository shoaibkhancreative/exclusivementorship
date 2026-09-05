-- Adds a display name for users. Nullable so existing rows are unaffected;
-- backfilled opportunistically at login (see getOrCreateUser / verifyOtp).

ALTER TABLE users ADD COLUMN name TEXT;

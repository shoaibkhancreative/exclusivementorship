-- Removes Telegram integration entirely. Mentorship access is granted
-- directly on-site (video-gated lessons, see migrations/0010) — there is no
-- longer any Telegram channel/group invite step after payment, so the table
-- that tracked those one-time invite links is dropped.
DROP TABLE IF EXISTS telegram_access;

-- Adds an explicit, per-lesson watermark toggle. Previously the email
-- watermark showed on every lesson whenever the viewer was logged in; this
-- makes it an admin-editable per-lesson setting instead (see
-- routes/admin.ts, routes/lessons.ts, and the admin Lessons page).
--
-- Default 0 (off) so existing lessons don't suddenly start showing a
-- watermark until an admin explicitly turns it on for a given lesson.
ALTER TABLE lessons ADD COLUMN watermark_enabled INTEGER NOT NULL DEFAULT 0;

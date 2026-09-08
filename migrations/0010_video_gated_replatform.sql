-- Replatform migration:
--   1. Lessons no longer rely on a hardcoded "Telegram gateway" class or a
--      hardcoded free-lesson count in code — both become admin-editable
--      site_settings (see lib/config.ts: getFreeLessonCount / and the new
--      admin Lessons & Settings pages).
--   2. Every lesson (including the former "outline-only, Telegram-delivered"
--      Classes 7-38) is now a real on-site video lesson. Free lessons are
--      hosted as unlisted YouTube videos; paid lessons are hosted on
--      Bunny.net. Either way, the admin now pastes a single ready-to-embed
--      iframe URL per lesson into `video_embed_url` — the old
--      `youtube_video_id`-only column is kept only for backward
--      compatibility with rows that still have it and is no longer written
--      to by the admin UI.
--   3. Chapters (semester groupings), previously a static array in
--      src/worker/lib/semesters.ts, move into a real `chapters` table so
--      admins can add/edit/reorder/rename them from the panel.
--   4. Progression ("can the learner move to the next class") is now driven
--      entirely by `lesson_progress.video_completed` (finishing the video),
--      not by assignment submission — the assignment system itself is
--      being removed from the product (see routes/lessons.ts, db.ts). The
--      `assignments` / `support_messages` / `notifications` tables are left
--      in place (harmless, unused) rather than dropped, so no historical
--      data is destroyed by this migration.
--
-- SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS / OR IGNORE),
-- matching the project's existing migration style.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- lessons: add the generic embed-URL column admins fill in directly.
-- ---------------------------------------------------------------------------
ALTER TABLE lessons ADD COLUMN video_embed_url TEXT;

-- Backfill video_embed_url for the 6 classes that already had a real
-- YouTube video id, so existing content keeps working immediately after
-- migrating, before an admin touches anything.
UPDATE lessons
   SET video_embed_url = 'https://www.youtube-nocookie.com/embed/' || youtube_video_id
 WHERE video_embed_url IS NULL
   AND youtube_video_id IS NOT NULL
   AND youtube_video_id NOT IN ('N/A-TELEGRAM-DELIVERED')
   AND youtube_video_id NOT LIKE 'REPLACE_YT_ID%';

-- Classes that were previously "outline-only" (delivered over Telegram, no
-- real video on-site) are switched off until an admin pastes a real embed
-- link and republishes them — never shown half-broken to a real learner.
UPDATE lessons SET is_active = 0 WHERE youtube_video_id = 'N/A-TELEGRAM-DELIVERED';

-- ---------------------------------------------------------------------------
-- chapters — admin-manageable replacement for the static SEMESTERS array.
-- `name` is the join key against lessons.chapter_name (unchanged from
-- before), so nothing about how lessons are grouped changes — only where
-- the chapter's own display name/tagline/order live.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,   -- must match lessons.chapter_name exactly
  tagline     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO chapters (name, tagline, sort_order) VALUES
  ('Foundation', 'Build the foundation before you learn to execute.', 1),
  ('Technical Edge', 'Learn to read price through liquidity, structure and delivery.', 2),
  ('Fundamental Edge', 'Understand the forces moving the market beyond the chart.', 3),
  ('System Building', 'Turn market knowledge into a repeatable trading framework.', 4),
  ('Validation & Psychology', 'A strategy is only useful when you can trust and execute it consistently.', 5),
  ('Execution & Prop Trading', 'Turn your framework into precise execution in the real market.', 6);

-- ---------------------------------------------------------------------------
-- site_settings keys used going forward (rows are created lazily by
-- setSetting the first time an admin saves them — see lib/config.ts):
--   free_lesson_count       — replaces the hardcoded FREE_LESSON_COUNT = 5
--   intro_video_embed_url   — the homepage intro video, editable in Settings
-- No INSERT needed here: getSetting() already falls back to a sane default
-- (5, and null respectively) when no row exists yet.
-- ---------------------------------------------------------------------------

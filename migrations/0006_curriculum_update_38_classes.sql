-- Curriculum update: rename Classes 1-6 to their new presentation titles and
-- add outline-only rows for Classes 7-38, completing the 6-semester /
-- 38-class public roadmap described in src/worker/lib/semesters.ts.
--
-- WHY A MIGRATION AND NOT A RESEED:
-- seed/seed.sql rebuilds the lessons table with DELETE + INSERT, which is
-- fine for a fresh/local database but NOT safe here: lesson_progress rows
-- reference lessons.id with ON DELETE CASCADE, so deleting and re-inserting
-- lessons 1-6 on a live database would silently wipe every real student's
-- progress. This migration instead:
--   1. UPDATEs lessons 1-6 in place, by lesson_number, changing only the
--      presentation fields (title, tagline, chapter_name) — the row's `id`
--      never changes, so lesson_progress / assignments / payment state for
--      existing users is completely unaffected.
--   2. INSERTs new outline-only rows for classes 7-38 (no video, no
--      assignment, is_free = 0). These are never real on-site lessons —
--      GET /api/lessons/:number always returns 403 "locked" for them,
--      exactly like any class outside a learner's unlocked sequence, since
--      that content is delivered inside the private Telegram mentorship.
--      `INSERT OR IGNORE` relies on the existing UNIQUE constraint on
--      lesson_number (see migrations/0001_init.sql) to make this idempotent:
--      safe to re-run without duplicating rows if it's ever applied twice.
--
-- Run this the same way as any other migration:
--   npm run db:migrate:local
--   npm run db:migrate:remote

-- ---------------------------------------------------------------------------
-- 1) Rename Classes 1-6 (real on-site lessons) — id preserved, only display
--    fields change. Video ids, descriptions, free/premium flags, sort order
--    and assignment content are untouched.
-- ---------------------------------------------------------------------------

UPDATE lessons SET
  title = 'The Real Game of Trading',
  chapter_name = 'Foundation',
  tagline = 'Understand what trading really is before you chase the idea of making money from it.'
WHERE lesson_number = 1;

UPDATE lessons SET
  title = 'Build Your Trading Account From Zero',
  chapter_name = 'Foundation',
  tagline = 'Set up the tools, account and execution basics you need to enter the market.'
WHERE lesson_number = 2;

UPDATE lessons SET
  title = 'Build Your Crypto Funding Setup',
  chapter_name = 'Foundation',
  tagline = 'Understand the essential crypto wallet and transfer process for modern trading.'
WHERE lesson_number = 3;

UPDATE lessons SET
  title = 'Why Most Technical Analysis Fails',
  chapter_name = 'Foundation',
  tagline = 'Discover why reading charts is not the same as understanding how price actually moves.'
WHERE lesson_number = 4;

UPDATE lessons SET
  title = 'Where the Market Hunts Liquidity — Volume 1',
  chapter_name = 'Technical Edge',
  tagline = 'Start seeing the liquidity behind the moves most traders chase.'
WHERE lesson_number = 5;

UPDATE lessons SET
  title = 'The Trap Before the Move',
  chapter_name = 'Technical Edge',
  tagline = 'Understand inducement and why the market often creates false commitment first.'
WHERE lesson_number = 6;

-- ---------------------------------------------------------------------------
-- 2) Add Classes 7-38 as outline-only roadmap entries.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, is_free, is_active, sort_order, assignment_title, assignment_instruction) VALUES
(7, 'The Footprints of Inefficiency', 'Technical Edge', '/thumbnails/lesson-07.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how Fair Value Gaps reveal what price leaves behind.', 0, 1, 7, NULL, NULL),
(8, 'Reading the Market''s Liquidity Map — Volume 2', 'Technical Edge', '/thumbnails/lesson-08.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Go deeper into how liquidity shapes the path of price.', 0, 1, 8, NULL, NULL),
(9, 'The Blocks Behind Price Delivery', 'Technical Edge', '/thumbnails/lesson-09.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Understand the institutional blocks that can influence where price moves next.', 0, 1, 9, NULL, NULL),
(10, 'Read the Market Like an Institution', 'Technical Edge', '/thumbnails/lesson-10.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Build a structural view of the market instead of reacting to isolated candles.', 0, 1, 10, NULL, NULL),
(11, 'Premium, Discount & OTE', 'Technical Edge', '/thumbnails/lesson-11.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn where an opportunity becomes more meaningful within the range.', 0, 1, 11, NULL, NULL),
(12, 'The Market''s Hidden Timing Framework', 'Technical Edge', '/thumbnails/lesson-12.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Understand how Power of Three and Quarterly Theory add timing to your analysis.', 0, 1, 12, NULL, NULL),
(13, 'The Time Windows Behind Price Delivery', 'Technical Edge', '/thumbnails/lesson-13.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Explore how IPDA and 90-minute cycles can frame the market''s timing.', 0, 1, 13, NULL, NULL),
(14, 'The Range That Shapes the Day', 'Technical Edge', '/thumbnails/lesson-14.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Discover how CBDR can provide important context before the trading day unfolds.', 0, 1, 14, NULL, NULL),
(15, 'The Small Clues Behind Big Moves', 'Technical Edge', '/thumbnails/lesson-15.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how ICT Macros can reveal short-term shifts hidden inside price action.', 0, 1, 15, NULL, NULL),
(16, 'Read the Candle Range, Read the Reversal', 'Technical Edge', '/thumbnails/lesson-16.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Use Candle Range Theory to understand possible shifts in price delivery.', 0, 1, 16, NULL, NULL),
(17, 'Trade the Data, Not the Headline', 'Fundamental Edge', '/thumbnails/lesson-17.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how to approach economic releases without becoming a victim of the news.', 0, 1, 17, NULL, NULL),
(18, 'Understand Money Before You Trade It', 'Fundamental Edge', '/thumbnails/lesson-18.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Build a better foundation by understanding what gives money its value.', 0, 1, 18, NULL, NULL),
(19, 'Who Controls the World''s Liquidity?', 'Fundamental Edge', '/thumbnails/lesson-19.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Understand the role major central banks play in global markets.', 0, 1, 19, NULL, NULL),
(20, 'How Central Banks Move Markets', 'Fundamental Edge', '/thumbnails/lesson-20.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn the tools and mandates that shape monetary conditions.', 0, 1, 20, NULL, NULL),
(21, 'Read the Macro Environment', 'Fundamental Edge', '/thumbnails/lesson-21.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Connect economic conditions to the bigger picture behind price movement.', 0, 1, 21, NULL, NULL),
(22, 'Follow the Money Across Markets', 'Fundamental Edge', '/thumbnails/lesson-22.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Use inter-market relationships to understand what different markets are telling you.', 0, 1, 22, NULL, NULL),
(23, 'See Where the Big Players Are Positioned', 'Fundamental Edge', '/thumbnails/lesson-23.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how COT data can reveal positioning that price alone may not show.', 0, 1, 23, NULL, NULL),
(24, 'Build Context Before You Trade', 'System Building', '/thumbnails/lesson-24.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Use Market Profiles to create a clearer picture before looking for an entry.', 0, 1, 24, NULL, NULL),
(25, 'Decide the Direction Before the Entry', 'System Building', '/thumbnails/lesson-25.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Build a Weekly and Daily Bias so execution starts with a clear idea.', 0, 1, 25, NULL, NULL),
(26, 'Build Your Own Trading Playbook', 'System Building', '/thumbnails/lesson-26.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Turn your knowledge into a personal trading plan you can actually follow.', 0, 1, 26, NULL, NULL),
(27, 'Survive Long Enough to Become Consistent', 'System Building', '/thumbnails/lesson-27.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Build the risk framework that protects your capital and your decision-making.', 0, 1, 27, NULL, NULL),
(28, 'Train the Trader, Not Just the Strategy', 'Validation & Psychology', '/thumbnails/lesson-28.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Develop the mindset required to follow your process when the market gets difficult.', 0, 1, 28, NULL, NULL),
(29, 'Break the Habits That Sabotage Your Trades', 'Validation & Psychology', '/thumbnails/lesson-29.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Identify the psychological barriers that repeatedly damage execution.', 0, 1, 29, NULL, NULL),
(30, 'Turn Every Trade Into Data', 'Validation & Psychology', '/thumbnails/lesson-30.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Use effective journaling to discover patterns, mistakes and opportunities for improvement.', 0, 1, 30, NULL, NULL),
(31, 'Trade When the Market Actually Moves', 'Execution & Prop Trading', '/thumbnails/lesson-31.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how Sessions and Killzones can focus your execution around meaningful market activity.', 0, 1, 31, NULL, NULL),
(32, 'Three High-Precision ICT Entry Models', 'Execution & Prop Trading', '/thumbnails/lesson-32.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Explore Unicorn, Turtle Soup and Venom as structured execution models.', 0, 1, 32, NULL, NULL),
(33, 'Confirm the Shift Before You Commit', 'Execution & Prop Trading', '/thumbnails/lesson-33.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Use CISD, MSS and Sharp Turn to improve entry confirmation.', 0, 1, 33, NULL, NULL),
(34, 'The Silver Bullet Setup', 'Execution & Prop Trading', '/thumbnails/lesson-34.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Understand one of ICT''s most recognizable time-based execution models.', 0, 1, 34, NULL, NULL),
(35, 'Turn the Asian Range Into a Setup', 'Execution & Prop Trading', '/thumbnails/lesson-35.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn how the Asian session can become a structured execution framework.', 0, 1, 35, NULL, NULL),
(36, 'From Personal Capital to Prop Capital', 'Execution & Prop Trading', '/thumbnails/lesson-36.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Understand how proprietary trading firms can fit into a trader''s journey.', 0, 1, 36, NULL, NULL),
(37, 'Survive the Challenge', 'Execution & Prop Trading', '/thumbnails/lesson-37.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Learn the rules, constraints and common mistakes that can make or break a prop challenge.', 0, 1, 37, NULL, NULL),
(38, 'Build a Prop-Firm-Ready Execution Plan', 'Execution & Prop Trading', '/thumbnails/lesson-38.jpg', 'N/A-TELEGRAM-DELIVERED', NULL, 'Adapt your strategy, risk and execution process for the realities of prop trading.', 0, 1, 38, NULL, NULL);

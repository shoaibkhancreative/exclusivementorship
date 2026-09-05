-- Exclusive Mentorship — seed content
-- Edit freely: this is the single place lesson content lives.
-- Replace youtube_video_id and thumbnail_url with real values before launch.
--
-- Titles follow the approved high-level curriculum order (see project
-- brief §8). Only lessons 1–5 (free) and lesson 6 (the paid Telegram
-- handoff gate, see TELEGRAM_GATEWAY_LESSON in src/worker/lib/config.ts)
-- exist as website rows. Lessons beyond the gate are intentionally NOT
-- modeled as on-site video lessons — per the product spec, everything past
-- the gate is delivered inside the private Telegram mentorship, not on the
-- website. If you want to preview upcoming curriculum on the outline
-- without exposing it here, do that inside the PDF instead.

DELETE FROM lessons;

INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, is_free, is_active, sort_order, assignment_title, assignment_instruction) VALUES

(1, 'Introduction to Trading', 'Foundation', '/thumbnails/lesson-01.jpg', 'REPLACE_YT_ID_1',
 'What trading actually is once you strip away the noise, and the small number of ideas everything else in this course builds on.',
 'Build the foundation before you step into the market.',
 1, 1, 1,
 'Frame your current approach',
 'In a few sentences, write down how you currently decide when to enter a trade. Be honest — this is only for you.'),

(2, 'Trading Account Setup', 'Foundation', '/thumbnails/lesson-02.jpg', 'REPLACE_YT_ID_2',
 'Choosing a broker, understanding order types, and setting up your account the right way before any money is at risk.',
 'Set up your environment properly before a single trade is placed.',
 1, 1, 2,
 'Set up your workspace',
 'List the broker/platform you plan to use and take a screenshot of your account dashboard once it''s set up.'),

(3, 'Crypto Wallet', 'Foundation', '/thumbnails/lesson-03.jpg', 'REPLACE_YT_ID_3',
 'How custody, wallets, and on-chain payments actually work — the practical basics you need before enrolling in anything paid.',
 'Understand the tool you will actually use to move and secure funds.',
 1, 1, 3,
 'Confirm your wallet setup',
 'Install or confirm access to a USDT-compatible wallet and write one sentence on how you plan to keep it secure.'),

(4, 'Darkside of Technical Analysis', 'Market Concepts', '/thumbnails/lesson-04.jpg', 'REPLACE_YT_ID_4',
 'Why most retail chart patterns fail in practice, and what that tells you about who is really moving price.',
 'Understand why the obvious way of reading price often falls short.',
 1, 1, 4,
 'Audit a past trade',
 'Look back at one recent trade that didn''t work out. Was it based on a textbook pattern? Write two sentences on what you''d question about it now.'),

(5, 'Institutional Liquidity — Volume 1', 'Market Concepts', '/thumbnails/lesson-05.jpg', 'REPLACE_YT_ID_5',
 'An introduction to liquidity — where it rests, why it exists, and how it starts to explain price movement that retail analysis can''t.',
 'Learn to see where liquidity becomes part of the market''s next move.',
 1, 1, 5,
 'Mark liquidity on a chart',
 'Open any chart you follow and mark two areas of obvious resting liquidity (equal highs or equal lows).'),

(6, 'Inducement', 'Exclusive Mentorship', '/thumbnails/lesson-06.jpg', 'REPLACE_YT_ID_6',
 'This class is part of Exclusive Mentorship.',
 'See how the market convinces traders to move before it truly does.',
 0, 1, 6, NULL, NULL);

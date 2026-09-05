-- Exclusive Mentorship — seed content
-- Edit freely: this is the single place lesson content lives.
-- Replace youtube_video_id and thumbnail_url with real values before launch.

DELETE FROM lessons;

INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, is_free, is_active, sort_order, assignment_title, assignment_instruction) VALUES
(1, 'Introduction to the Framework', 'Foundation', '/thumbnails/lesson-01.jpg', 'REPLACE_YT_ID_1',
 'Why institutional price delivery looks nothing like retail chart patterns, and the mental model we will build on.',
 1, 1, 1,
 'Frame your current approach',
 'In a few sentences, write down how you currently decide when to enter a trade. Be honest — this is only for you.'),

(2, 'Understanding Market Structure', 'Market Structure', '/thumbnails/lesson-02.jpg', 'REPLACE_YT_ID_2',
 'Higher highs, higher lows, and why "structure" means more than a textbook definition.',
 1, 1, 2,
 'Mark structure on a chart',
 'Open any chart you follow and manually mark the last 3 structural swing points. Note whether structure is currently bullish, bearish, or ranging.'),

(3, 'Liquidity: Where Price Wants to Go', 'Liquidity', '/thumbnails/lesson-03.jpg', 'REPLACE_YT_ID_3',
 'Equal highs/lows, stop clusters, and how institutional flow interacts with retail liquidity.',
 1, 1, 3,
 'Identify liquidity pools',
 'On the same chart, mark two areas of obvious resting liquidity (equal highs or equal lows).'),

(4, 'Price Delivery & Displacement', 'Price Delivery', '/thumbnails/lesson-04.jpg', 'REPLACE_YT_ID_4',
 'How displacement confirms intent, and how to separate signal from noise.',
 1, 1, 4,
 'Spot a displacement move',
 'Find one recent displacement candle/leg on your chart and write one sentence on what it suggests about intent.'),

(5, 'Fundamental & Macro Bias', 'Fundamental Analysis', '/thumbnails/lesson-05.jpg', 'REPLACE_YT_ID_5',
 'Building a macro bias before you ever look at an entry — the missing layer most retail traders skip.',
 1, 1, 5,
 'Write today''s macro bias',
 'In two or three sentences, write your current macro bias for one instrument you follow, and why.'),

(6, 'Intraday Execution Framework', 'Intraday Execution', '/thumbnails/lesson-06.jpg', 'REPLACE_YT_ID_6',
 'Premium mentorship content.', 0, 1, 6, NULL, NULL),

(7, 'Risk & Trade Management', 'Risk Management', '/thumbnails/lesson-07.jpg', 'REPLACE_YT_ID_7',
 'Premium mentorship content.', 0, 1, 7, NULL, NULL),

(8, 'Building a Personal Trading Process', 'Process & Discipline', '/thumbnails/lesson-08.jpg', 'REPLACE_YT_ID_8',
 'Premium mentorship content.', 0, 1, 8, NULL, NULL);

PRAGMA foreign_keys = ON;

ALTER TABLE lessons ADD COLUMN video_embed_url TEXT;

UPDATE lessons
   SET video_embed_url = 'https://www.youtube-nocookie.com/embed/' || youtube_video_id
 WHERE video_embed_url IS NULL
   AND youtube_video_id IS NOT NULL
   AND youtube_video_id NOT IN ('N/A-TELEGRAM-DELIVERED')
   AND youtube_video_id NOT LIKE 'REPLACE_YT_ID%';

UPDATE lessons SET is_active = 0 WHERE youtube_video_id = 'N/A-TELEGRAM-DELIVERED';

CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
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


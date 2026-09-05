-- Adds a short, curiosity-driven "tagline" per lesson, distinct from the
-- longer `description` shown on the lesson page itself. The tagline is what
-- renders in the compact course outline (thumbnail + number + title +
-- tagline + state) per the product spec — outline items must not expose
-- internal subtopics, only a one-line hook.

ALTER TABLE lessons ADD COLUMN tagline TEXT;

-- site_content — admin-editable page copy (Phase 1 of the "full site
-- manager" work). Separate from `site_settings` (which is a bare
-- key/value store for a handful of numeric/URL config values) because
-- every row here also carries its own `default_value` — the fallback the
-- public site renders when no admin override exists yet, AND the value a
-- "reset to default" action restores. Keeping the default alongside the
-- row (rather than only in code) means the admin Content page can show
-- "currently: <override>, default: <default>" without a deploy, and a
-- reset never depends on redeploying code that still remembers the old
-- default.
--
-- `key` is namespaced by page/section, e.g. 'home.hero_title',
-- 'lesson.nav_previous', 'email.otp_subject' — see db.ts getContentMap /
-- setContent and worker/lib/content.ts (the single source of truth for
-- which keys exist and their seeded defaults).
--
-- Purely additive: no existing table is touched.

CREATE TABLE IF NOT EXISTS site_content (
  key            TEXT PRIMARY KEY,
  value          TEXT,             -- NULL = no override yet, fall back to default_value
  default_value  TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by     TEXT              -- admins.id, best-effort only (no FK — same reasoning as site_settings.updated_by)
);

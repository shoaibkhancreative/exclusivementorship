-- site_layout — per-page block order + visibility (Phase 3 of the site-
-- manager work). One row per page; `blocks` is a JSON array of
-- {"id": "<block id>", "visible": true|false} in display order.
--
-- Block ids are a fixed, code-defined set per page (see
-- src/worker/lib/layout.ts's PAGE_BLOCKS — the single source of truth for
-- which blocks exist on which page and what they render). This table only
-- ever reorders/hides *those* blocks; it does not define new block types,
-- so admin edits here can never reference something the page doesn't know
-- how to render.
--
-- Purely additive: no existing table is touched.

CREATE TABLE IF NOT EXISTS site_layout (
  page_key    TEXT PRIMARY KEY,
  blocks      TEXT NOT NULL,   -- JSON array of {id, visible}, in order
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT             -- admins.id, best-effort only (no FK — same reasoning as site_settings.updated_by)
);

-- Adds two columns to support_tickets (migrations/0016):
--
-- hidden_by_user_at — set when a learner taps "Close conversation" on
-- their side. This is deliberately NOT the same as `status` (which stays
-- admin-controlled, open/closed): hiding only affects what the LEARNER
-- sees in their own ticket list (GET /support/tickets). The ticket still
-- exists, is still fully visible in the admin inbox, and an admin can
-- "Unhide" it to put it back in the learner's list (see
-- POST /admin/support/tickets/:id/unhide).
--
-- origin_path — the page path (e.g. "/lesson/12") the learner was on when
-- they opened the ticket, captured client-side at creation time. Shown in
-- the admin conversation view so an agent has some context for where the
-- question came from.
PRAGMA foreign_keys = ON;

ALTER TABLE support_tickets ADD COLUMN hidden_by_user_at TEXT;
ALTER TABLE support_tickets ADD COLUMN origin_path TEXT;

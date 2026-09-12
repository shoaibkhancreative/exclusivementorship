-- Adds a marker so the abandoned-checkout reminder job (scheduled.ts /
-- sendAbandonedCheckoutReminders) can send at most one reminder per order
-- and never re-send on a later cron run. NULL means "not sent yet".
ALTER TABLE payment_orders ADD COLUMN reminder_sent_at TEXT;

-- Adds the fields needed for the in-site (non-hosted) crypto checkout.
-- Previously we only stored `pay_url` (a NOWPayments-hosted invoice link).
-- Now we render the payment address / amount / QR ourselves, so we need to
-- persist what the NOWPayments "create payment" (non-hosted) API returns.

ALTER TABLE payment_orders ADD COLUMN pay_address TEXT;
ALTER TABLE payment_orders ADD COLUMN pay_amount_crypto REAL;
ALTER TABLE payment_orders ADD COLUMN pay_currency TEXT;
ALTER TABLE payment_orders ADD COLUMN expires_at TEXT;

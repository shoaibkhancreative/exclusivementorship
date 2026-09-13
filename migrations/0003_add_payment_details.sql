ALTER TABLE payment_orders ADD COLUMN pay_address TEXT;
ALTER TABLE payment_orders ADD COLUMN pay_amount_crypto REAL;
ALTER TABLE payment_orders ADD COLUMN pay_currency TEXT;
ALTER TABLE payment_orders ADD COLUMN expires_at TEXT;

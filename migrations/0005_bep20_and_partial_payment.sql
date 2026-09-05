-- 1) Switch the default pay currency to USDT on BEP20 (BNB Smart Chain) —
--    lowest network fee of NOWPayments' supported USDT networks. Existing
--    rows are untouched; this only changes what NEW orders default to
--    if the currency column is ever left unset (the app always sets it
--    explicitly, but we keep the schema default honest).
ALTER TABLE payment_orders RENAME TO payment_orders_old;

CREATE TABLE payment_orders (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nowpayments_payment_id TEXT UNIQUE,
  amount                REAL NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'usdtbsc',
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','waiting','confirming','confirmed','finished','failed','expired','cancelled')),
  pay_url               TEXT,
  pay_address           TEXT,
  pay_amount_crypto     REAL,
  pay_currency          TEXT,
  expires_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at          TEXT,
  raw_last_webhook      TEXT,
  -- How much was actually received on-chain, per the last IPN — kept even
  -- when it doesn't match `pay_amount_crypto` so underpaid/overpaid orders
  -- have a paper trail. NULL until at least one payment IPN arrives.
  actually_paid         REAL,
  -- Set when an underpaid order was auto-unlocked because the shortfall
  -- was within the configured tolerance, so support can see at a glance
  -- which "paid" orders were exact vs. tolerated.
  underpaid_tolerated   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO payment_orders
  (id, user_id, nowpayments_payment_id, amount, currency, status, pay_url,
   pay_address, pay_amount_crypto, pay_currency, expires_at, created_at,
   confirmed_at, raw_last_webhook)
SELECT
  id, user_id, nowpayments_payment_id, amount, currency, status, pay_url,
  pay_address, pay_amount_crypto, pay_currency, expires_at, created_at,
  confirmed_at, raw_last_webhook
FROM payment_orders_old;

DROP TABLE payment_orders_old;

CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_np_id ON payment_orders(nowpayments_payment_id);

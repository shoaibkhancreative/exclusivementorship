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
  actually_paid         REAL,
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

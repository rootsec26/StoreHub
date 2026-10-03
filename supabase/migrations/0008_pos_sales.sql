-- Smart POS & Cashier Sales Engine: sales channel + payment capture fields.
-- Safe to run repeatedly (all statements are idempotent).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check;
ALTER TABLE orders ADD CONSTRAINT orders_channel_check
  CHECK (channel IN ('online', 'pos', 'whatsapp', 'manual'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'refunded'));

CREATE INDEX IF NOT EXISTS idx_orders_store_channel ON orders(store_id, channel);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

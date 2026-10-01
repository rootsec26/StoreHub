-- Smart Shipping & Thermal Label Studio: delivery zones + order fulfillment fields.
-- Safe to run repeatedly (all statements are idempotent).

-- Per-region delivery fees (Cairo, Alexandria, Upper Egypt, ...)
CREATE TABLE IF NOT EXISTS shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  estimated_delivery_days INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fulfillment fields on every order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone_id UUID REFERENCES shipping_zones(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shipping_zones_store_id ON shipping_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_zone_id ON orders(shipping_zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);

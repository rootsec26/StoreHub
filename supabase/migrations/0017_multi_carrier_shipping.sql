-- Multi-carrier shipping routing & branded tracking engine.
-- Adds the carrier account table plus the routing/tracking columns on orders.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS shipping_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  api_key TEXT DEFAULT '',
  api_secret TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  default_for_governorates TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipping_integrations_store_id_idx ON shipping_integrations(store_id);
CREATE INDEX IF NOT EXISTS shipping_integrations_store_carrier_idx ON shipping_integrations(store_id, carrier);

-- Routing + live tracking fields on every order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS airway_bill_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status TEXT NOT NULL DEFAULT 'UNFULFILLED';

-- Backfill: orders that already carry a tracking number have a label created.
UPDATE orders
   SET shipping_status = 'LABEL_CREATED'
 WHERE shipping_status = 'UNFULFILLED'
   AND tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_shipping_status_idx ON orders(shipping_status);
CREATE INDEX IF NOT EXISTS orders_carrier_name_idx ON orders(carrier_name);

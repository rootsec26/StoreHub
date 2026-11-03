CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Price alerts / wishlist drops table
-- One row per product + contact + baseline price the shopper saw.
-- Public storefront API inserts rows; store owners manage status.
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email','phone')),
  contact_value TEXT NOT NULL,
  baseline_price TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- A shopper can only hold one active alert per product per contact.
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_contact_product_unique ON price_alerts (store_id, product_id, contact_type, contact_value);

CREATE INDEX IF NOT EXISTS idx_price_alerts_store ON price_alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_product ON price_alerts(product_id);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Public: anyone can INSERT a new alert (checkout-like guest behaviour).
-- Store owners can read/update/dismiss alerts for their store.
CREATE POLICY "Price alerts public insert" ON price_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Price alerts owner read" ON price_alerts
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Price alerts owner update" ON price_alerts
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Price alerts owner delete" ON price_alerts
  FOR DELETE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

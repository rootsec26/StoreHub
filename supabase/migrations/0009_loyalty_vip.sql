-- Smart Customer Loyalty, Cashback & VIP Tiers Engine.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  points_per_amount NUMERIC(10,2) NOT NULL DEFAULT '10',
  redemption_rate NUMERIC(10,2) NOT NULL DEFAULT '10',
  signup_bonus_points INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_settings_store_unique
  ON loyalty_settings(store_id);

CREATE TABLE IF NOT EXISTS vip_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  tier_name TEXT NOT NULL,
  min_spend_threshold NUMERIC(12,2) NOT NULL DEFAULT '0',
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT '0',
  free_shipping_unlocked BOOLEAN NOT NULL DEFAULT false,
  badge_color TEXT NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vip_tiers_store_id_idx ON vip_tiers(store_id);
CREATE INDEX IF NOT EXISTS vip_tiers_store_spend_idx
  ON vip_tiers(store_id, min_spend_threshold);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_lifetime_spend NUMERIC(12,2) NOT NULL DEFAULT '0',
  current_vip_tier_id UUID REFERENCES vip_tiers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_store_id_idx ON customers(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_store_phone_unique
  ON customers(store_id, phone);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'earn',
  balance_after INTEGER NOT NULL DEFAULT 0,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_transactions_store_id_idx
  ON loyalty_transactions(store_id);
CREATE INDEX IF NOT EXISTS loyalty_transactions_customer_id_idx
  ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS loyalty_transactions_order_id_idx
  ON loyalty_transactions(order_id);

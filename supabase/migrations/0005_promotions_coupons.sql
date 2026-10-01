-- Promotions & Flash Sales engine: timed sales + coupon codes.
-- Safe to run repeatedly (all statements are idempotent).

-- Timed flash sales shown as a sticky countdown banner on the storefront
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  discount_percentage INT NOT NULL DEFAULT 0,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  banner_text TEXT DEFAULT '',
  -- Toggle for the live countdown banner on /store/[slug]
  show_banner BOOLEAN NOT NULL DEFAULT TRUE,
  -- Empty arrays apply the promotion to the whole catalog
  target_product_ids JSONB DEFAULT '[]'::jsonb,
  target_category_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Coupon codes redeemed at checkout
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_spend NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 1,
  times_used INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupons_store_code_unique UNIQUE (store_id, code)
);

-- Coupon redemption recorded on every order that used a code
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_promotions_store_id ON promotions(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON coupons(store_id);

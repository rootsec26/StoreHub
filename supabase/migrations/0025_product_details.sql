-- Advanced product merchandising fields for dashboard + storefront detail pages.
-- Idempotent so it can be applied safely to existing databases.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS sale_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_percent integer,
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'IN_STOCK',
  ADD COLUMN IF NOT EXISTS image_gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_availability_check;

ALTER TABLE products
  ADD CONSTRAINT products_availability_check
  CHECK (availability IN ('IN_STOCK', 'OUT_OF_STOCK', 'COMING_SOON'));

CREATE INDEX IF NOT EXISTS products_store_sku_idx
  ON products (store_id, sku);

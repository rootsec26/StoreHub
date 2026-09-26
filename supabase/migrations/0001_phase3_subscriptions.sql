-- Phase 3: Subscriptions & Plan Limits + Store Theme Customization
-- Safe to run repeatedly (all statements are idempotent).

-- Subscription tier per store: 'free' (max 15 products) or 'pro' (unlimited)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Brand accent color used by the storefront theme (hex, e.g. #4f46e5)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '';

-- Analytics lookups: revenue trends by date and top-selling products
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Flexible shipping / delivery pricing for merchants.
--
-- stores.shipping_mode controls how the storefront charges delivery:
--   'disabled' -> no shipping fee is added at checkout (legacy behaviour)
--   'flat'     -> one fixed rate for every order (سعر موحد)
--   'zones'    -> shipping_flat_rate is the base rate for most areas and
--                 active shipping_zones rows act as exceptions with their
--                 own rate (سعر موحد مع استثناءات)
--
-- orders.shipping_fee records the fee actually charged so invoices,
-- tracking pages and merchant reports can break it out of total_amount.
-- Safe to run repeatedly (all statements are idempotent).

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT NOT NULL DEFAULT 'disabled';

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS shipping_flat_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

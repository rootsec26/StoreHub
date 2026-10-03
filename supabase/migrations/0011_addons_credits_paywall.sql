-- Add-ons, Credits & Paywall Management System.
-- Adds the pay-per-use credit balances + paid add-on flags to `stores`, plus
-- the `store_add_ons` (monthly subscriptions) and `store_credits` (top-up /
-- usage ledger) tables that back the billing dashboard.
-- Safe to run repeatedly (all statements are idempotent).

-- Pay-per-use balances and add-on entitlements on the store itself
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ai_credits INTEGER NOT NULL DEFAULT 50;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS has_white_label BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS max_staff_seats INTEGER NOT NULL DEFAULT 1;

-- Monthly paid add-ons (white_label = 99 EGP/month, staff_seats = 50 EGP/seat/month)
CREATE TABLE IF NOT EXISTS store_add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  add_on_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  monthly_price NUMERIC(10, 2) NOT NULL DEFAULT '0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_add_ons_store_id_idx ON store_add_ons(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS store_add_ons_store_code_unique
  ON store_add_ons(store_id, add_on_code);

-- Append-only ledger of every credit purchase and every credit deduction
CREATE TABLE IF NOT EXISTS store_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  credit_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_credits_store_id_idx ON store_credits(store_id);
CREATE INDEX IF NOT EXISTS store_credits_store_type_idx ON store_credits(store_id, credit_type);

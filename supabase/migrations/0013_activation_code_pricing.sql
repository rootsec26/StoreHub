-- Activation Code Pricing & Promos Table
--
-- Dynamic pricing for each activation code type (plan/credit vouchers).
-- Super Admins can edit base price, promo price, and promo expiration.
-- Safe to run repeatedly (all statements are idempotent).

-- ---------------------------------------------------------------------------
-- 1. Create activation_code_pricing table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activation_code_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches ACTIVATION_CODE_TYPES from billing-packages.ts
  type TEXT NOT NULL UNIQUE,
  -- Base price in EGP (what merchants pay normally)
  base_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Optional promotional price in EGP
  promo_price NUMERIC(10, 2),
  -- When the promotional price expires (ISO timestamp)
  promo_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. Insert default pricing for all activation code types
-- ---------------------------------------------------------------------------
INSERT INTO activation_code_pricing (type, base_price, promo_price, promo_expires_at)
VALUES
  ('PLAN_PRO', 299.00, NULL, NULL),
  ('PLAN_ENTERPRISE', 2999.00, NULL, NULL),
  ('AI_CREDITS_500', 100.00, NULL, NULL),
  ('AI_CREDITS_2000', 300.00, NULL, NULL),
  ('WA_CREDITS_500', 150.00, NULL, NULL),
  ('WA_CREDITS_2000', 500.00, NULL, NULL)
ON CONFLICT (type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Index for fast lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS activation_code_pricing_type_idx ON activation_code_pricing(type);
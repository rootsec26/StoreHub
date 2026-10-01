-- Adds every stores column that src/db/schema.ts declares but the live
-- database is still missing (theme_config, currency, payments), plus the
-- activation_codes table used by the billing/admin routes.
-- Safe to run repeatedly (all statements are idempotent).

-- Currency used by the store (e.g., EGP, USD, SAR, AED, EUR)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EGP';

-- Currencies the store accepts at checkout
ALTER TABLE stores ADD COLUMN IF NOT EXISTS supported_currencies JSONB
  DEFAULT '["EGP", "USD", "SAR", "AED", "EUR"]'::jsonb;

-- Stripe Connect payout account + enable flag
ALTER TABLE stores ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN DEFAULT FALSE;

-- Paddle vendor id + enable flag
ALTER TABLE stores ADD COLUMN IF NOT EXISTS paddle_vendor_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS paddle_enabled BOOLEAN DEFAULT FALSE;

-- Copy shown to customers for manual/bank transfer payments
ALTER TABLE stores ADD COLUMN IF NOT EXISTS manual_payment_instructions TEXT;

-- Storefront theme customization (colors, font, hero style, announcement bar)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS theme_config JSONB
  DEFAULT '{
    "themeId": "modern",
    "primaryColor": "#4f46e5",
    "secondaryColor": "#06b6d4",
    "backgroundColor": "#ffffff",
    "textColor": "#0f172a",
    "fontFamily": "Cairo",
    "borderRadius": "md",
    "heroStyle": "banner",
    "showAnnouncementBar": false
  }'::jsonb;

-- Plan activation codes (billing/activate + admin generate-code routes)
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pro',
  price NUMERIC(10, 2),
  discount INTEGER DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  times_used INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activation_codes_code_unique UNIQUE (code)
);

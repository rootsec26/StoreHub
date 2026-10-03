-- Strict Real Billing, Voucher System & Credit Expiration Engine.
--
-- 1. `stores` gains the three expiry timestamps that the strict paywall reads:
--      plan_expires_at / ai_credits_expires_at / wa_credits_expires_at
-- 2. `activation_codes` is reshaped from the legacy plan-only table into the
--      voucher table used by the redemption engine (type, credit_amount,
--      plan_days, is_used, used_by_store_id, used_at, expires_at).
--
-- Safe to run repeatedly (all statements are idempotent).

-- ---------------------------------------------------------------------------
-- 1. Store entitlement expiry columns
-- ---------------------------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Credit balances expire 30 days after they are granted; the column default
-- keeps the free allowance granted at signup inside a valid window.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ai_credits_expires_at TIMESTAMPTZ
  DEFAULT (now() + interval '30 days');
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wa_credits_expires_at TIMESTAMPTZ
  DEFAULT (now() + interval '30 days');

-- Backfill rows that already exist so nothing lapses the moment the column
-- appears. Each statement only touches NULL rows, so re-running is a no-op.
UPDATE stores
   SET plan_expires_at = now() + interval '30 days'
 WHERE plan = 'pro' AND plan_expires_at IS NULL;

UPDATE stores
   SET ai_credits_expires_at = now() + interval '30 days'
 WHERE ai_credits_expires_at IS NULL AND ai_credits > 0;

UPDATE stores
   SET wa_credits_expires_at = now() + interval '30 days'
 WHERE wa_credits_expires_at IS NULL AND whatsapp_credits > 0;

-- ---------------------------------------------------------------------------
-- 2. activation_codes -> voucher table
-- ---------------------------------------------------------------------------
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'PLAN_PRO';
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS credit_amount INTEGER;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS plan_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_by_store_id UUID
  REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Carry over rows produced by the legacy plan-only generator.
-- Guarded so re-running the migration after the legacy columns were dropped
-- (lines below) is a no-op instead of erroring on `times_used`/`max_uses`.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'activation_codes'
           AND column_name  = 'times_used'
      )
  AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'activation_codes'
           AND column_name  = 'max_uses'
      )
  THEN
    UPDATE activation_codes
       SET is_used = TRUE,
           used_at = COALESCE(created_at, now())
     WHERE times_used >= max_uses AND is_used = FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activation_codes_type_idx ON activation_codes(type);
CREATE INDEX IF NOT EXISTS activation_codes_is_used_idx ON activation_codes(is_used);

-- Drop the legacy plan-only columns so the live table matches the schema.
ALTER TABLE activation_codes DROP COLUMN IF EXISTS plan;
ALTER TABLE activation_codes DROP COLUMN IF EXISTS price;
ALTER TABLE activation_codes DROP COLUMN IF EXISTS discount;
ALTER TABLE activation_codes DROP COLUMN IF EXISTS max_uses;
ALTER TABLE activation_codes DROP COLUMN IF EXISTS times_used;
ALTER TABLE activation_codes DROP COLUMN IF EXISTS is_active;

-- Restrict `type` to the six voucher products the app can redeem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activation_codes_type_check'
  ) THEN
    ALTER TABLE activation_codes ADD CONSTRAINT activation_codes_type_check
      CHECK (type IN (
        'PLAN_PRO',
        'PLAN_ENTERPRISE',
        'AI_CREDITS_500',
        'AI_CREDITS_2000',
        'WA_CREDITS_500',
        'WA_CREDITS_2000'
      ));
  END IF;
END $$;

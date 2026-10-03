-- Billing Packages Enhancement
--
-- Add Arabic/English names and active status to activation_code_pricing table
-- (serving as the billing_packages table per requirements)
-- Safe to run repeatedly (all statements are idempotent).

-- ---------------------------------------------------------------------------
-- 1. Add new columns to activation_code_pricing table
-- ---------------------------------------------------------------------------
ALTER TABLE activation_code_pricing
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. Update existing records with default names
-- ---------------------------------------------------------------------------
UPDATE activation_code_pricing
SET
  name_ar = CASE type
    WHEN 'PLAN_PRO' THEN 'الخطة الاحترافية - 30 يوم'
    WHEN 'PLAN_ENTERPRISE' THEN 'خطة المؤسسات - 365 يوم'
    WHEN 'AI_CREDITS_500' THEN '500 رصيد ذكاء اصطناعي'
    WHEN 'AI_CREDITS_2000' THEN '2000 رصيد ذكاء اصطناعي'
    WHEN 'WA_CREDITS_500' THEN '500 رسالة واتساب'
    WHEN 'WA_CREDITS_2000' THEN '2000 رسالة واتساب'
    ELSE type
  END,
  name_en = CASE type
    WHEN 'PLAN_PRO' THEN 'Pro Plan - 30 Days'
    WHEN 'PLAN_ENTERPRISE' THEN 'Enterprise Plan - 365 Days'
    WHEN 'AI_CREDITS_500' THEN '500 AI Credits'
    WHEN 'AI_CREDITS_2000' THEN '2000 AI Credits'
    WHEN 'WA_CREDITS_500' THEN '500 WhatsApp Messages'
    WHEN 'WA_CREDITS_2000' THEN '2000 WhatsApp Messages'
    ELSE type
  END
WHERE name_ar IS NULL OR name_en IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Index for active packages
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS activation_code_pricing_is_active_idx ON activation_code_pricing(is_active);
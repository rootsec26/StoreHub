-- Aura Hub: unified multi-product access model.
-- `products` stores a per-product access map keyed by product
-- (e.g. {"storehub": {"status": "active", "onboardingCompleted": true}}).
-- `last_used_product` powers the "continue where you left off" action.
-- Existing merchants are treated as StoreHub-active by the application
-- layer (store ownership implies access), so no backfill is required.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS products JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_used_product TEXT;

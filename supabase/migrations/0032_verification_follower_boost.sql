-- Verification follower boost.
--
-- Approving a store verification request (free or paid) grants the store the
-- promised 10k-follower milestone instantly: `follower_boost` is added on top
-- of the real store_followers row count everywhere a follower total is shown
-- (storefront follow button, merchant dashboard, admin verification queue).
-- Safe to run repeatedly (idempotent).

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS follower_boost INTEGER NOT NULL DEFAULT 0;

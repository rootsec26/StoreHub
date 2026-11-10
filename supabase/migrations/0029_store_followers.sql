-- Store followers: shoppers follow a storefront to get updates/audience metrics.
-- `user_id` stores either an app user id (uuid) or an anonymous visitor id
-- generated client-side, so the column is TEXT rather than UUID.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS store_followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_followers_store_id_idx
  ON store_followers(store_id);
CREATE INDEX IF NOT EXISTS store_followers_created_at_idx
  ON store_followers(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.store_followers'::regclass
      AND conname = 'store_followers_store_user_unique'
  ) THEN
    ALTER TABLE store_followers
      ADD CONSTRAINT store_followers_store_user_unique UNIQUE (store_id, user_id);
  END IF;
END $$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE store_followers ENABLE ROW LEVEL SECURITY;

-- Anyone can read follower rows (counts, recent-follower lists).
DROP POLICY IF EXISTS "store_followers_public_read" ON store_followers;
CREATE POLICY "store_followers_public_read" ON store_followers
  FOR SELECT USING (true);

-- Authenticated users may only follow/unfollow as themselves.
DROP POLICY IF EXISTS "store_followers_owner_insert" ON store_followers;
CREATE POLICY "store_followers_owner_insert" ON store_followers
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "store_followers_owner_delete" ON store_followers;
CREATE POLICY "store_followers_owner_delete" ON store_followers
  FOR DELETE USING (user_id = auth.uid()::text);

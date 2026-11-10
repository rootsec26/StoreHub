-- Platform feed: super-admin posts + follower graph
-- Public read of published posts; all writes go through the API (service
-- role bypasses RLS). Follows are managed via /api/platform/follow only.

CREATE TABLE IF NOT EXISTS platform_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_name TEXT NOT NULL DEFAULT 'StoreHub',
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'UPDATE',
  link_url TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_posts_published_idx
  ON platform_posts (is_published, created_at);

CREATE TABLE IF NOT EXISTS platform_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_follows_follower_unique
  ON platform_follows (follower_id);
CREATE INDEX IF NOT EXISTS platform_follows_created_at_idx
  ON platform_follows (created_at);

ALTER TABLE platform_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can read published posts (feed is public).
DROP POLICY IF EXISTS "Platform posts public read published" ON platform_posts;
CREATE POLICY "Platform posts public read published" ON platform_posts
  FOR SELECT USING (is_published = true);

-- Follower rows are only ever read/written through the API; no direct
-- client access is granted.

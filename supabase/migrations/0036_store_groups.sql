-- Store groups: merchant-run community space per store.
-- Merchants post announcements; shoppers request to join and only approved
-- members can read posts (enforced by the API — the postgres role bypasses
-- RLS, so no client-facing policies are granted on posts/members).

CREATE TABLE IF NOT EXISTS store_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_groups_store_unique
  ON store_groups (store_id);

CREATE TABLE IF NOT EXISTS store_group_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES store_groups(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_group_posts_group_idx
  ON store_group_posts (group_id, created_at);

CREATE TABLE IF NOT EXISTS store_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES store_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_group_members_group_user_unique
  ON store_group_members (group_id, user_id);
CREATE INDEX IF NOT EXISTS store_group_members_status_idx
  ON store_group_members (group_id, status);

ALTER TABLE store_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_group_members ENABLE ROW LEVEL SECURITY;

-- Group metadata is public (title/description only — posts stay API-gated).
DROP POLICY IF EXISTS "store_groups_public_read" ON store_groups;
CREATE POLICY "store_groups_public_read" ON store_groups
  FOR SELECT USING (true);

-- Posts and members are only accessed through the API (service role),
-- so no direct client policies are defined for them.

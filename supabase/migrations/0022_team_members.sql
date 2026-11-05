CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TEAM MANAGEMENT (store members + invitations)
-- ============================================================
-- `stores.owner_id` remains the single OWNER. Additional staff are
-- rows in `store_members` (role = 'ADMIN'). Access is enforced in the
-- API layer via src/lib/auth.ts -> resolveStoreForUser(); the RLS
-- policies below mirror that for direct Supabase clients.

CREATE TABLE IF NOT EXISTS store_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_members_store_user_unique UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_members_user_idx ON store_members (user_id);
CREATE INDEX IF NOT EXISTS store_members_store_idx ON store_members (store_id);

CREATE TABLE IF NOT EXISTS store_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN')),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_invitations_store_idx
  ON store_invitations (store_id, status);
CREATE INDEX IF NOT EXISTS store_invitations_email_idx
  ON store_invitations (lower(email));

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_invitations ENABLE ROW LEVEL SECURITY;

-- Members can see who else belongs to their store.
CREATE POLICY "Store members read" ON store_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())
  );

-- Only the store owner (or the API service role, which bypasses RLS)
-- can add/remove members.
CREATE POLICY "Store members owner insert" ON store_members
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Store members owner delete" ON store_members
  FOR DELETE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Store invitations owner read" ON store_invitations
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Store invitations owner insert" ON store_invitations
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Store invitations owner update" ON store_invitations
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Store invitations owner delete" ON store_invitations
  FOR DELETE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

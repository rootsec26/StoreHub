-- Global platform broadcast banner
-- Admin-published announcement rendered at the top of the site for every
-- visitor while is_active = true and expires_at is still in the future.
CREATE TABLE IF NOT EXISTS platform_broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_broadcasts_active_idx
  ON platform_broadcasts (is_active, expires_at);

ALTER TABLE platform_broadcasts ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read the currently live banner. Writes stay restricted
-- to the postgres/service role used by the admin API (which bypasses RLS).
DROP POLICY IF EXISTS "Platform broadcasts public read active" ON platform_broadcasts;
CREATE POLICY "Platform broadcasts public read active" ON platform_broadcasts
  FOR SELECT USING (is_active = true AND expires_at > NOW());

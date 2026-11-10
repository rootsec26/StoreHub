-- Store Verification (توثيق المتجر): free verification at 10k followers or a
-- paid 700 EGP Vodafone Cash tier. Admins review requests and issue a
-- verification code; the merchant redeems it (or admin approval verifies
-- directly) and the storefront shows the official badge.
-- Safe to run repeatedly (all statements are idempotent).

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS verification_type TEXT;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS verification_code TEXT;

CREATE INDEX IF NOT EXISTS stores_is_verified_idx ON stores(is_verified);

CREATE TABLE IF NOT EXISTS store_verification_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- 'free' (10k followers) | 'paid' (700 EGP Vodafone Cash)
  type TEXT NOT NULL,
  -- pending | approved | rejected
  status TEXT NOT NULL DEFAULT 'pending',
  -- Vodafone Cash transaction reference / sender number the merchant provides.
  payment_reference TEXT NOT NULL DEFAULT '',
  -- Optional compressed data:image/...;base64,... screenshot of the transfer.
  payment_proof TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS store_verification_requests_store_id_idx
  ON store_verification_requests(store_id);
CREATE INDEX IF NOT EXISTS store_verification_requests_status_idx
  ON store_verification_requests(status);
CREATE INDEX IF NOT EXISTS store_verification_requests_created_at_idx
  ON store_verification_requests(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- Payment proofs are sensitive: no public access. The app talks to Postgres
-- through the service connection which bypasses RLS.
ALTER TABLE store_verification_requests ENABLE ROW LEVEL SECURITY;

-- Aura Hub: manual subscription payment requests (StoreHub monthly plan).
-- Vodafone Cash only: sender_phone + transaction_id (operation number from
-- the confirmation SMS). transaction_id_normalized (lowercase, whitespace
-- stripped) is UNIQUE only while the request is pending/approved — a
-- rejected request must not burn a valid receipt number.
-- reference_code stays as an internal request id shown to admins.
-- Additive + idempotent only.

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  product_key TEXT NOT NULL DEFAULT 'storehub',
  plan TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  method TEXT NOT NULL DEFAULT 'vodafone_cash',
  reference_code TEXT NOT NULL UNIQUE,
  sender_phone TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  transaction_id_normalized TEXT NOT NULL,
  -- Compressed data:image/(jpeg|png|webp);base64,... proof payload.
  -- Private: never selected by list queries; served only via the
  -- owner/admin-authenticated proof endpoint.
  proof_data TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_requests_user_idx
  ON payment_requests (user_id, created_at);

CREATE INDEX IF NOT EXISTS payment_requests_status_idx
  ON payment_requests (status);

-- One receipt = one live request, across ALL users. Rejected/expired rows
-- release the receipt so a corrected request can reuse it.
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_txn_unique
  ON payment_requests (transaction_id_normalized)
  WHERE status IN ('pending', 'approved');

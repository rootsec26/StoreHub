-- Manual e-transfer payment proofs (Vodafone Cash / InstaPay screenshots).
-- Idempotent so it can be applied safely to existing databases.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_proof_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS payment_proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method_detail text DEFAULT '';

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_proof_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_proof_status_check
  CHECK (payment_proof_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS orders_store_payment_proof_idx
  ON orders (store_id, payment_proof_status);

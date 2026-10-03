-- Smart COD Verification & Anti-Return Fraud Shield Engine.
-- Verification fields on orders. Safe to run repeatedly (idempotent).

-- NOT_REQUIRED is the column default so non-COD orders (card, wallet, POS,
-- prepaid transfers) never inherit a pending verification. COD order inserts
-- set `cod_verification_status = 'PENDING_VERIFICATION'` explicitly in
-- src/app/api/checkout/route.ts, so COD orders always start as pending.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_score TEXT NOT NULL DEFAULT 'LOW';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_reasons TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
-- Last WhatsApp verification dispatch (restarts the EXPIRED timeout on resend).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cod_verification_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_cod_verification_status_check
  CHECK (cod_verification_status IN ('NOT_REQUIRED', 'PENDING_VERIFICATION', 'VERIFIED', 'EXPIRED'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_risk_score_check;
ALTER TABLE orders ADD CONSTRAINT orders_risk_score_check
  CHECK (risk_score IN ('LOW', 'MEDIUM', 'HIGH'));

CREATE INDEX IF NOT EXISTS idx_orders_cod_verification_status ON orders(cod_verification_status);
CREATE INDEX IF NOT EXISTS idx_orders_store_phone ON orders(store_id, customer_phone);

-- Normalize orders.status to the canonical uppercase enum defined in
-- src/lib/types.ts (ORDER_STATUSES):
--   PENDING, CONFIRMED, PROCESSING, READY, SHIPPED, DELIVERED, CANCELLED
--
-- Legacy spellings still present in live rows (written by the pre-audit code
-- paths):
--   'Pending', 'Confirmed', 'Preparing', 'Ready', 'Shipped', 'Completed',
--   'Cancelled' and any mixed-case variants of the canonical words.
-- Mapping: Preparing -> PROCESSING, Completed -> DELIVERED, everything else
-- uppercased to its canonical spelling. Unknown values are left untouched so
-- the guarded CHECK below simply skips them instead of failing the migration.
--
-- Idempotent: scripts/apply-migration.js has no ledger and re-runs every file
-- on each invocation, so each statement below is a no-op the second time.

UPDATE orders
   SET status = CASE
     WHEN upper(status) IN ('PREPARING', 'PROCESSING') THEN 'PROCESSING'
     WHEN upper(status) = 'COMPLETED' THEN 'DELIVERED'
     ELSE upper(status)
   END
 WHERE upper(status) IN (
     'PENDING', 'CONFIRMED', 'PREPARING', 'PROCESSING',
     'READY', 'SHIPPED', 'COMPLETED', 'DELIVERED', 'CANCELLED'
   )
   AND status IS DISTINCT FROM CASE
     WHEN upper(status) IN ('PREPARING', 'PROCESSING') THEN 'PROCESSING'
     WHEN upper(status) = 'COMPLETED' THEN 'DELIVERED'
     ELSE upper(status)
   END;

-- New inserts default to the canonical spelling (drizzle schema default was
-- flipped to "PENDING" in src/db/schema.ts; this brings the live column along).
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PENDING';

-- Restrict the column to the canonical enum once the backfill has landed.
-- Guarded twice: skip if the constraint already exists, and skip if any row
-- still holds a value outside the enum (e.g. manually inserted data) so the
-- migration degrades to a notice instead of erroring mid-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_status_check'
       AND conrelid = 'orders'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM orders
       WHERE status NOT IN (
         'PENDING', 'CONFIRMED', 'PROCESSING', 'READY',
         'SHIPPED', 'DELIVERED', 'CANCELLED'
       )
    ) THEN
      ALTER TABLE orders ADD CONSTRAINT orders_status_check
        CHECK (status IN (
          'PENDING', 'CONFIRMED', 'PROCESSING', 'READY',
          'SHIPPED', 'DELIVERED', 'CANCELLED'
        ));
    ELSE
      RAISE NOTICE 'orders_status_check NOT added: rows with non-canonical status remain';
    END IF;
  END IF;
END $$;

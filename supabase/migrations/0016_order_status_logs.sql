-- Order status audit trail.
-- `order_status_logs` is defined in src/db/schema.ts and written by
-- PATCH /api/orders, POST /api/orders/cancel and the COD verification engine,
-- but it was never created by a SQL migration. Idempotent create + indexes.
CREATE TABLE IF NOT EXISTS order_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_logs_order_id_idx ON order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS order_status_logs_store_id_idx ON order_status_logs(store_id);
CREATE INDEX IF NOT EXISTS order_status_logs_created_at_idx ON order_status_logs(created_at);

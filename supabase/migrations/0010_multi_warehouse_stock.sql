-- Multi-Warehouse & Branch Stock Engine.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  is_main_warehouse BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouses_store_id_idx ON warehouses(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_store_code_unique
  ON warehouses(store_id, code);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS warehouse_stock_warehouse_id_idx
  ON warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS warehouse_stock_product_id_idx
  ON warehouse_stock(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_stock_location_unique
  ON warehouse_stock(warehouse_id, product_id);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_transfers_store_id_idx ON stock_transfers(store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS stock_transfers_from_warehouse_idx
  ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_warehouse_idx
  ON stock_transfers(to_warehouse_id);

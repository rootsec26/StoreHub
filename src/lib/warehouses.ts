// Isomorphic helpers for the Multi-Warehouse & Branch Stock Engine.
// Kept free of runtime database imports so dashboard components can reuse
// the record shapes and city-matching rules on the client (type-only imports
// are erased at compile time).

import type {
  stockTransfers,
  warehouseStock,
  warehouses,
} from "@/db/schema";

export type TransferStatus = "pending" | "in_transit" | "completed";

export const TRANSFER_STATUSES: readonly TransferStatus[] = [
  "pending",
  "in_transit",
  "completed",
];

export function isTransferStatus(value: unknown): value is TransferStatus {
  return (
    typeof value === "string" &&
    (TRANSFER_STATUSES as readonly string[]).includes(value)
  );
}

export interface WarehouseRecord {
  id: string;
  storeId: string;
  name: string;
  code: string;
  city: string;
  address: string;
  isMainWarehouse: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface WarehouseStockRecord {
  id: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  reservedQuantity: number;
}

export interface StockTransferRecord {
  id: string;
  storeId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  quantity: number;
  status: TransferStatus;
  notes: string;
  createdAt: string;
}

export interface StockLineInput {
  productId: string;
  quantity: number;
}

export interface WarehouseDeductionResult {
  /** Warehouse the order was fulfilled from (when the engine is configured). */
  warehouseId: string | null;
  warehouseName: string | null;
  /** True when at least one line was deducted from a warehouse. */
  applied: boolean;
}

/** Lower-cased, whitespace-collapsed city used for address matching. */
export function normalizeCity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when the free-text customer address mentions this warehouse's city. */
export function warehouseMatchesCity(
  warehouse: Pick<WarehouseRecord, "city">,
  address: string
): boolean {
  const city = normalizeCity(warehouse.city);
  if (!city) return false;
  return normalizeCity(address).includes(city);
}

/**
 * Closest-branch resolution: a regional branch in the customer's city wins,
 * otherwise the store falls back to its designated main warehouse, and finally
 * to the first active location.
 */
export function pickFulfillmentWarehouse(
  warehouses: WarehouseRecord[],
  address: string
): WarehouseRecord | null {
  const active = warehouses.filter((warehouse) => warehouse.isActive);
  if (active.length === 0) return null;

  const inCity = active.filter((warehouse) =>
    warehouseMatchesCity(warehouse, address)
  );
  const branchInCity = inCity.find(
    (warehouse) => !warehouse.isMainWarehouse
  );
  if (branchInCity) return branchInCity;
  if (inCity.length > 0) return inCity[0];

  return (
    active.find((warehouse) => warehouse.isMainWarehouse) ?? active[0] ?? null
  );
}

/** Units at a location that are still free to sell or move. */
export function availableQuantity(
  stock: Pick<WarehouseStockRecord, "quantity" | "reservedQuantity">
): number {
  return Math.max(0, stock.quantity - stock.reservedQuantity);
}

export function warehouseRecordFromRow(
  row: typeof warehouses.$inferSelect
): WarehouseRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    code: row.code,
    city: row.city ?? "",
    address: row.address ?? "",
    isMainWarehouse: row.isMainWarehouse,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export function stockRecordFromRow(
  row: typeof warehouseStock.$inferSelect
): WarehouseStockRecord {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    productId: row.productId,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity,
  };
}

export function transferRecordFromRow(
  row: typeof stockTransfers.$inferSelect
): StockTransferRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    fromWarehouseId: row.fromWarehouseId,
    toWarehouseId: row.toWarehouseId,
    productId: row.productId,
    quantity: row.quantity,
    status: isTransferStatus(row.status) ? row.status : "pending",
    notes: row.notes ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

// Server-only fulfilment half of the Multi-Warehouse & Branch Stock Engine.
// Kept apart from `@/lib/warehouses` (isomorphic, client-safe) so this module
// can freely import the database client.

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders, products, warehouseStock, warehouses } from "@/db/schema";
import {
  pickFulfillmentWarehouse,
  warehouseRecordFromRow,
  type StockLineInput,
  type WarehouseDeductionResult,
  type WarehouseRecord,
} from "@/lib/warehouses";

const EMPTY_RESULT: WarehouseDeductionResult = {
  warehouseId: null,
  warehouseName: null,
  applied: false,
};

function cleanLines(items: StockLineInput[]): StockLineInput[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item.productId !== "string" || !item.productId) continue;
    const quantity = Math.floor(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + quantity);
  }
  return Array.from(merged, ([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/** Primary branch first, then the main warehouse, then every other location. */
function candidateOrder(
  primary: WarehouseRecord,
  all: WarehouseRecord[]
): WarehouseRecord[] {
  const rest = all.filter(
    (warehouse) => warehouse.isActive && warehouse.id !== primary.id
  );
  rest.sort((a, b) => Number(b.isMainWarehouse) - Number(a.isMainWarehouse));
  return [primary, ...rest];
}

/**
 * Storefront checkout integration: deducts each ordered line from the closest
 * regional branch (matched on the customer address city), falling back to the
 * designated main warehouse, and mirrors the change onto the catalog
 * `products.stock` aggregate.
 *
 * Never throws — a stock-engine failure must not block a paid order.
 */
export async function deductWarehouseStockForOrder(params: {
  storeId: string;
  customerAddress: string;
  items: StockLineInput[];
}): Promise<WarehouseDeductionResult> {
  try {
    const lines = cleanLines(params.items ?? []);
    if (lines.length === 0) return EMPTY_RESULT;

    const rows = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, params.storeId));

    const locations = rows.map(warehouseRecordFromRow);
    const primary = pickFulfillmentWarehouse(
      locations,
      params.customerAddress ?? ""
    );
    if (!primary) return EMPTY_RESULT;

    const candidates = candidateOrder(primary, locations);

    const applied = await db.transaction(async (tx) => {
      let appliedAny = false;

      for (const line of lines) {
        let deducted = false;

        for (const candidate of candidates) {
          const updated = await tx
            .update(warehouseStock)
            .set({
              quantity: sql`${warehouseStock.quantity} - ${line.quantity}`,
            })
            .where(
              and(
                eq(warehouseStock.warehouseId, candidate.id),
                eq(warehouseStock.productId, line.productId),
                gte(warehouseStock.quantity, line.quantity)
              )
            )
            .returning({ id: warehouseStock.id });

          if (updated.length > 0) {
            deducted = true;
            break;
          }
        }

        if (deducted) appliedAny = true;

        // Keep the storefront's catalog counter in sync with the sale even
        // when a line has no per-location allocation yet (guarded so it can
        // never go negative).
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${line.quantity}` })
          .where(
            and(
              eq(products.id, line.productId),
              eq(products.storeId, params.storeId),
              gte(products.stock, line.quantity)
            )
          )
          .returning({ id: products.id });
      }

      return appliedAny;
    });

    return {
      warehouseId: applied ? primary.id : null,
      warehouseName: applied ? primary.name : null,
      applied,
    };
  } catch (error) {
    console.error("Warehouse stock deduction failed:", error);
    return EMPTY_RESULT;
  }
}

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inverse of {@link deductWarehouseStockForOrder}: every cancellation path
 * must call this inside its own transaction so cancelled orders do not leave
 * inventory permanently stuck (both the catalog aggregate and the per-branch
 * rows the deduction touched).
 *
 * The branch is chosen with the exact same candidate ordering used at sale
 * time, so the units return to the location they came from.
 */
export async function restockOrder(
  runner: DbExecutor,
  params: { orderId: string; storeId: string }
): Promise<void> {
  const itemRows = await runner
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, params.orderId));
  const lines = cleanLines(itemRows);
  if (lines.length === 0) return;

  const orderRows = await runner
    .select({ customerAddress: orders.customerAddress })
    .from(orders)
    .where(and(eq(orders.id, params.orderId), eq(orders.storeId, params.storeId)))
    .limit(1);

  for (const line of lines) {
    await runner
      .update(products)
      .set({ stock: sql`${products.stock} + ${line.quantity}` })
      .where(
        and(eq(products.id, line.productId), eq(products.storeId, params.storeId))
      )
      .returning({ id: products.id });
  }

  try {
    const rows = await runner
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, params.storeId));

    const locations = rows.map(warehouseRecordFromRow);
    const primary = pickFulfillmentWarehouse(
      locations,
      orderRows[0]?.customerAddress ?? ""
    );
    if (!primary) return;

    const candidates = candidateOrder(primary, locations);

    for (const line of lines) {
      for (const candidate of candidates) {
        const updated = await runner
          .update(warehouseStock)
          .set({ quantity: sql`${warehouseStock.quantity} + ${line.quantity}` })
          .where(
            and(
              eq(warehouseStock.warehouseId, candidate.id),
              eq(warehouseStock.productId, line.productId)
            )
          )
          .returning({ id: warehouseStock.id });

        if (updated.length > 0) break;
      }
    }
  } catch (error) {
    console.error("Warehouse stock restock failed:", error);
  }
}

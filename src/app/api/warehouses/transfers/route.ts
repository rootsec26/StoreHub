import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  products,
  stockTransfers,
  stores,
  warehouseStock,
  warehouses,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { transferRecordFromRow } from "@/lib/warehouses";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function badRequest(error: string, code: string) {
  return NextResponse.json({ error, code }, { status: 400 });
}

/** Stock transfers between branches: create, approve & ship, confirm receipt. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const rows = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.storeId, store.id))
      .orderBy(desc(stockTransfers.createdAt))
      .limit(200);

    return NextResponse.json({ transfers: rows.map(transferRecordFromRow) });
  } catch (error) {
    console.error("Get stock transfers error:", error);
    return createErrorResponse(error, "Failed to fetch stock transfers");
  }
}

// Initiate a transfer (status: pending)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const fromWarehouseId =
      typeof body?.fromWarehouseId === "string" ? body.fromWarehouseId : "";
    const toWarehouseId =
      typeof body?.toWarehouseId === "string" ? body.toWarehouseId : "";
    const productId =
      typeof body?.productId === "string" ? body.productId : "";
    const quantity = Math.floor(Number(body?.quantity));

    if (!fromWarehouseId || !toWarehouseId || !productId) {
      return badRequest(
        "Source, destination and product are required",
        "MISSING_FIELDS"
      );
    }
    if (fromWarehouseId === toWarehouseId) {
      return badRequest(
        "Source and destination must be different warehouses",
        "SAME_WAREHOUSE"
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return badRequest("Quantity must be a positive number", "INVALID_QUANTITY");
    }

    const locationRows = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, store.id));

    const byId = new Map(locationRows.map((row) => [row.id, row]));
    const from = byId.get(fromWarehouseId);
    const to = byId.get(toWarehouseId);

    if (!from || !to) {
      return NextResponse.json(
        { error: "Warehouse not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    if (!from.isActive || !to.isActive) {
      return badRequest(
        "Both warehouses must be active to transfer stock",
        "WAREHOUSE_INACTIVE"
      );
    }

    const productRows = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, store.id)))
      .limit(1);
    if (productRows.length === 0) {
      return NextResponse.json(
        { error: "Product not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const sourceStock = await db
      .select()
      .from(warehouseStock)
      .where(
        and(
          eq(warehouseStock.warehouseId, fromWarehouseId),
          eq(warehouseStock.productId, productId)
        )
      )
      .limit(1);

    const available = sourceStock.length
      ? Math.max(
          0,
          sourceStock[0].quantity - sourceStock[0].reservedQuantity
        )
      : 0;

    if (available < quantity) {
      return NextResponse.json(
        {
          error: `Insufficient stock at ${from.name}: ${available} available`,
          code: "INSUFFICIENT_STOCK",
          available,
        },
        { status: 409 }
      );
    }

    const inserted = await db
      .insert(stockTransfers)
      .values({
        storeId: store.id,
        fromWarehouseId,
        toWarehouseId,
        productId,
        quantity,
        status: "pending",
        notes: typeof body?.notes === "string" ? body.notes.trim() : "",
      })
      .returning();

    return NextResponse.json({
      transfer: transferRecordFromRow(inserted[0]),
    });
  } catch (error) {
    console.error("Create stock transfer error:", error);
    return createErrorResponse(error, "Failed to create stock transfer");
  }
}

// Advance a transfer: action "ship" (pending -> in_transit) or
// "receive" (in_transit -> completed)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const action = typeof body?.action === "string" ? body.action : "";

    if (!id) return badRequest("Transfer ID is required", "MISSING_ID");
    if (action !== "ship" && action !== "receive") {
      return badRequest("Unknown transfer action", "INVALID_ACTION");
    }

    const transferRows = await db
      .select()
      .from(stockTransfers)
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.storeId, store.id)))
      .limit(1);

    if (transferRows.length === 0) {
      return NextResponse.json(
        { error: "Transfer not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    const transfer = transferRows[0];

    if (action === "ship") {
      if (transfer.status !== "pending") {
        return badRequest(
          "Only pending transfers can be shipped",
          "INVALID_STATUS"
        );
      }

      const updated = await db.transaction(async (tx) => {
        // Atomic guarded decrement: the last units may have shipped already.
        const deducted = await tx
          .update(warehouseStock)
          .set({
            quantity: sql`${warehouseStock.quantity} - ${transfer.quantity}`,
          })
          .where(
            and(
              eq(warehouseStock.warehouseId, transfer.fromWarehouseId),
              eq(warehouseStock.productId, transfer.productId),
              gte(warehouseStock.quantity, transfer.quantity)
            )
          )
          .returning({ id: warehouseStock.id });

        if (deducted.length === 0) return null;

        const rows = await tx
          .update(stockTransfers)
          .set({ status: "in_transit" })
          .where(eq(stockTransfers.id, transfer.id))
          .returning();

        return rows[0];
      });

      if (!updated) {
        return NextResponse.json(
          {
            error: "Insufficient stock at the source warehouse",
            code: "INSUFFICIENT_STOCK",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({ transfer: transferRecordFromRow(updated) });
    }

    if (transfer.status !== "in_transit") {
      return badRequest(
        "Only transfers in transit can be received",
        "INVALID_STATUS"
      );
    }

    const received = await db.transaction(async (tx) => {
      await tx
        .insert(warehouseStock)
        .values({
          warehouseId: transfer.toWarehouseId,
          productId: transfer.productId,
          quantity: transfer.quantity,
          reservedQuantity: 0,
        })
        .onConflictDoUpdate({
          target: [warehouseStock.warehouseId, warehouseStock.productId],
          set: {
            quantity: sql`${warehouseStock.quantity} + ${transfer.quantity}`,
          },
        });

      const rows = await tx
        .update(stockTransfers)
        .set({ status: "completed" })
        .where(eq(stockTransfers.id, transfer.id))
        .returning();

      return rows[0];
    });

    return NextResponse.json({ transfer: transferRecordFromRow(received) });
  } catch (error) {
    console.error("Update stock transfer error:", error);
    return createErrorResponse(error, "Failed to update stock transfer");
  }
}

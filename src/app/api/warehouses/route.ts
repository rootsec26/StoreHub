import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

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
import {
  stockRecordFromRow,
  transferRecordFromRow,
  warehouseRecordFromRow,
} from "@/lib/warehouses";

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

function toInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Warehouses & Branches engine: location CRUD, the per-location stock
 * allocation matrix, and the summary used by the dashboard sidebar badge.
 */
export async function GET(request: NextRequest) {
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

    const locationRows = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, store.id))
      .orderBy(asc(warehouses.isMainWarehouse), asc(warehouses.name));

    const locationIds = locationRows.map((row) => row.id);
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";

    const pendingTransfers = await countTransfers(
      store.id,
      locationIds,
      "pending"
    );
    const inTransitTransfers = await countTransfers(
      store.id,
      locationIds,
      "in_transit"
    );

    const activeCount = locationRows.filter((row) => row.isActive).length;

    if (summaryOnly) {
      return NextResponse.json({
        activeCount,
        locationCount: locationRows.length,
        pendingTransfers,
        inTransitTransfers,
      });
    }

    const stockRows = locationIds.length
      ? await db
          .select()
          .from(warehouseStock)
          .where(inArray(warehouseStock.warehouseId, locationIds))
      : [];

    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        stock: products.stock,
        imageUrl: products.imageUrl,
        isVisible: products.isVisible,
      })
      .from(products)
      .where(eq(products.storeId, store.id))
      .orderBy(asc(products.name));

    const transferRows = await db
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.storeId, store.id))
      .orderBy(desc(stockTransfers.createdAt))
      .limit(200);

    const totalUnits = stockRows.reduce((sum, row) => sum + row.quantity, 0);

    return NextResponse.json({
      warehouses: locationRows.map(warehouseRecordFromRow),
      stock: stockRows.map(stockRecordFromRow),
      products: productRows,
      transfers: transferRows.map(transferRecordFromRow),
      stats: {
        locationCount: locationRows.length,
        activeCount,
        totalUnits,
        pendingTransfers,
        inTransitTransfers,
      },
    });
  } catch (error) {
    console.error("Get warehouses error:", error);
    return createErrorResponse(error, "Failed to fetch warehouses");
  }
}

async function countTransfers(
  storeId: string,
  locationIds: string[],
  status: string
): Promise<number> {
  if (locationIds.length === 0) return 0;
  const rows = await db
    .select({ id: stockTransfers.id })
    .from(stockTransfers)
    .where(
      and(
        eq(stockTransfers.storeId, storeId),
        eq(stockTransfers.status, status),
        inArray(stockTransfers.fromWarehouseId, locationIds)
      )
    );
  return rows.length;
}

// Create a warehouse / branch
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const code =
      typeof body?.code === "string" && body.code.trim()
        ? body.code.trim()
        : "";

    if (!name || !code) {
      return badRequest("Name and code are required", "MISSING_FIELDS");
    }

    const isMainWarehouse = Boolean(body?.isMainWarehouse);
    const isActive = body?.isActive !== false;

    const created = await db.transaction(async (tx) => {
      if (isMainWarehouse) {
        await tx
          .update(warehouses)
          .set({ isMainWarehouse: false })
          .where(eq(warehouses.storeId, store.id));
      }

      const inserted = await tx
        .insert(warehouses)
        .values({
          storeId: store.id,
          name,
          code,
          city: typeof body?.city === "string" ? body.city.trim() : "",
          address: typeof body?.address === "string" ? body.address.trim() : "",
          isMainWarehouse,
          isActive,
        })
        .returning();

      return inserted[0];
    });

    return NextResponse.json({
      warehouse: warehouseRecordFromRow(created),
    });
  } catch (error) {
    console.error("Create warehouse error:", error);
    return createErrorResponse(error, "Failed to create warehouse");
  }
}

// Update a warehouse, or bulk-save the stock allocation matrix
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
    if (!body) return badRequest("Invalid payload", "INVALID_PAYLOAD");

    // ---- Stock allocation matrix -------------------------------------
    if (Array.isArray(body.stock)) {
      const entries = body.stock as Array<{
        warehouseId?: unknown;
        productId?: unknown;
        quantity?: unknown;
        reservedQuantity?: unknown;
      }>;

      const cleaned = entries
        .map((entry) => ({
          warehouseId:
            typeof entry?.warehouseId === "string" ? entry.warehouseId : "",
          productId:
            typeof entry?.productId === "string" ? entry.productId : "",
          quantity: Math.max(0, toInt(entry?.quantity, 0)),
          reservedQuantity: Math.max(0, toInt(entry?.reservedQuantity, 0)),
        }))
        .filter((entry) => entry.warehouseId && entry.productId);

      if (cleaned.length === 0) {
        return badRequest("No stock entries supplied", "MISSING_FIELDS");
      }

      const ownedWarehouseIds = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(eq(warehouses.storeId, store.id));
      const ownedSet = new Set(ownedWarehouseIds.map((row) => row.id));
      if (cleaned.some((entry) => !ownedSet.has(entry.warehouseId))) {
        return NextResponse.json(
          { error: "Warehouse not found in your store", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      const ownedProductIds = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.storeId, store.id));
      const productSet = new Set(ownedProductIds.map((row) => row.id));
      if (cleaned.some((entry) => !productSet.has(entry.productId))) {
        return NextResponse.json(
          { error: "Product not found in your store", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      await db.transaction(async (tx) => {
        for (const entry of cleaned) {
          await tx
            .insert(warehouseStock)
            .values({
              warehouseId: entry.warehouseId,
              productId: entry.productId,
              quantity: entry.quantity,
              reservedQuantity: entry.reservedQuantity,
            })
            .onConflictDoUpdate({
              target: [warehouseStock.warehouseId, warehouseStock.productId],
              set: {
                quantity: entry.quantity,
                reservedQuantity: entry.reservedQuantity,
              },
            });
        }

        // The catalog counter mirrors the sum of every location so the
        // storefront keeps showing the real sellable total.
        const touchedProductIds = Array.from(
          new Set(cleaned.map((entry) => entry.productId))
        );
        const totals = await tx
          .select({
            productId: warehouseStock.productId,
            total: sql<number>`coalesce(sum(${warehouseStock.quantity}), 0)::int`,
          })
          .from(warehouseStock)
          .where(inArray(warehouseStock.productId, touchedProductIds))
          .groupBy(warehouseStock.productId);

        for (const row of totals) {
          await tx
            .update(products)
            .set({ stock: row.total })
            .where(
              and(eq(products.id, row.productId), eq(products.storeId, store.id))
            );
        }
      });

      return NextResponse.json({ updated: cleaned.length });
    }

    // ---- Warehouse record --------------------------------------------
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return badRequest("Warehouse ID is required", "MISSING_ID");

    const values: Partial<typeof warehouses.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) return badRequest("Name is required", "MISSING_FIELDS");
      values.name = name;
    }
    if (body.code !== undefined) {
      const code = String(body.code ?? "").trim();
      if (!code) return badRequest("Code is required", "MISSING_FIELDS");
      values.code = code;
    }
    if (body.city !== undefined) values.city = String(body.city ?? "").trim();
    if (body.address !== undefined) {
      values.address = String(body.address ?? "").trim();
    }
    if (body.isActive !== undefined) values.isActive = Boolean(body.isActive);
    if (body.isMainWarehouse !== undefined) {
      values.isMainWarehouse = Boolean(body.isMainWarehouse);
    }

    if (Object.keys(values).length === 0) {
      return badRequest("No fields to update", "MISSING_FIELDS");
    }

    const promoteMain = values.isMainWarehouse === true;

    const updated = await db.transaction(async (tx) => {
      if (promoteMain) {
        await tx
          .update(warehouses)
          .set({ isMainWarehouse: false })
          .where(eq(warehouses.storeId, store.id));
      }

      const rows = await tx
        .update(warehouses)
        .set(values)
        .where(and(eq(warehouses.id, id), eq(warehouses.storeId, store.id)))
        .returning();

      return rows[0];
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Warehouse not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      warehouse: warehouseRecordFromRow(updated),
    });
  } catch (error) {
    console.error("Update warehouse error:", error);
    return createErrorResponse(error, "Failed to update warehouse");
  }
}

// Delete a warehouse (its stock allocations cascade away)
export async function DELETE(request: NextRequest) {
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

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return badRequest("Warehouse ID is required", "MISSING_ID");

    const deleted = await db
      .delete(warehouses)
      .where(and(eq(warehouses.id, id), eq(warehouses.storeId, store.id)))
      .returning({ id: warehouses.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Warehouse not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete warehouse error:", error);
    return createErrorResponse(error, "Failed to delete warehouse");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, shippingZones, stores } from "@/db/schema";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  FULFILLED_ORDER_STATUSES,
  generateTrackingNumber,
  type ShippingLabelStore,
  type ShippingOrderRecord,
} from "@/lib/shipping";

const MAX_BULK_ORDERS = 100;

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({
      id: stores.id,
      name: stores.name,
      slug: stores.slug,
      logoUrl: stores.logoUrl,
      phone: stores.phone,
      address: stores.address,
    })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function unfulfilledCondition(storeId: string) {
  return and(
    eq(orders.storeId, storeId),
    notInArray(orders.status, [...FULFILLED_ORDER_STATUSES])
  );
}

function toLabelStore(
  store: NonNullable<Awaited<ReturnType<typeof getOwnedStore>>>
): ShippingLabelStore {
  return {
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl || null,
    phone: store.phone || null,
    address: store.address || null,
  };
}

function normalizeOrder(
  row: typeof orders.$inferSelect,
  zoneName: string | null,
  itemsCount: number
): ShippingOrderRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    customerName: row.customerName,
    customerPhone: row.customerPhone ?? "",
    customerAddress: row.customerAddress ?? "",
    notes: row.notes ?? "",
    totalAmount: String(row.totalAmount),
    status: row.status,
    shippingZoneId: row.shippingZoneId ?? null,
    trackingNumber: row.trackingNumber ?? null,
    courierName: row.courierName ?? null,
    labelPrintedAt: row.labelPrintedAt ? row.labelPrintedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    zoneName,
    itemsCount,
  };
}

// Orders ready for shipping (+ store identity for the thermal labels)
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

    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";

    if (summaryOnly) {
      const [row] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(orders)
        .where(unfulfilledCondition(store.id));

      return NextResponse.json({ unfulfilledCount: row?.value ?? 0 });
    }

    const rows = await db
      .select({ order: orders, zoneName: shippingZones.zoneName })
      .from(orders)
      .leftJoin(shippingZones, eq(orders.shippingZoneId, shippingZones.id))
      .where(unfulfilledCondition(store.id))
      .orderBy(desc(orders.createdAt))
      .limit(MAX_BULK_ORDERS * 2);

    const ids = rows.map((row) => row.order.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const countRows = await db
        .select({
          orderId: orderItems.orderId,
          total: sql<number>`count(*)::int`,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
        .groupBy(orderItems.orderId);
      for (const entry of countRows) counts.set(entry.orderId, entry.total);
    }

    const list = rows.map((row) =>
      normalizeOrder(row.order, row.zoneName, counts.get(row.order.id) ?? 0)
    );

    const [summary] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orders)
      .where(unfulfilledCondition(store.id));

    return NextResponse.json({
      store: toLabelStore(store),
      orders: list,
      unfulfilledCount: summary?.value ?? list.length,
    });
  } catch (error) {
    console.error("Get shipping queue error:", error);
    return createErrorResponse(error, "Failed to fetch orders ready for shipping");
  }
}

// Bulk fulfillment actions: prepare labels, print, ship, assign zone
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

    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "assignZone") {
      const orderId = typeof body?.orderId === "string" ? body.orderId : "";
      const zoneId =
        typeof body?.shippingZoneId === "string" && body.shippingZoneId
          ? body.shippingZoneId
          : null;

      if (!orderId) {
        return NextResponse.json(
          { error: "Order ID is required", code: "MISSING_ID" },
          { status: 400 }
        );
      }

      if (zoneId) {
        const zone = await db
          .select({ id: shippingZones.id })
          .from(shippingZones)
          .where(
            and(eq(shippingZones.id, zoneId), eq(shippingZones.storeId, store.id))
          )
          .limit(1);
        if (zone.length === 0) {
          return NextResponse.json(
            { error: "Forbidden: Zone not found in your store", code: "FORBIDDEN" },
            { status: 403 }
          );
        }
      }

      const updated = await db
        .update(orders)
        .set({ shippingZoneId: zoneId })
        .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
        .returning();

      if (updated.length === 0) {
        return NextResponse.json(
          { error: "Forbidden: Order not found in your store", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      return NextResponse.json({ order: updated[0] });
    }

    const rawIds: unknown[] = Array.isArray(body?.orderIds) ? body.orderIds : [];
    const orderIds: string[] = [
      ...new Set(
        rawIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "At least one order ID is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (orderIds.length > MAX_BULK_ORDERS) {
      return NextResponse.json(
        { error: `Bulk actions are limited to ${MAX_BULK_ORDERS} orders`, code: "TOO_MANY" },
        { status: 400 }
      );
    }

    const targets = await db
      .select()
      .from(orders)
      .where(and(inArray(orders.id, orderIds), eq(orders.storeId, store.id)));

    if (targets.length !== orderIds.length) {
      return NextResponse.json(
        { error: "Forbidden: Orders not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    if (action === "prepareLabels") {
      // Assign tracking numbers so the waybills have something to scan.
      for (const order of targets) {
        if (order.trackingNumber) continue;
        const trackingNumber = generateTrackingNumber();
        await db
          .update(orders)
          .set({ trackingNumber })
          .where(eq(orders.id, order.id));
        order.trackingNumber = trackingNumber;
      }

      return NextResponse.json({
        orders: targets.map((order) => normalizeOrder(order, null, 0)),
      });
    }

    if (action === "markLabelsPrinted") {
      const printedAt = new Date();
      await db
        .update(orders)
        .set({ labelPrintedAt: printedAt })
        .where(and(inArray(orders.id, orderIds), eq(orders.storeId, store.id)));

      return NextResponse.json({ updated: orderIds.length });
    }

    if (action === "markShipped") {
      const courier =
        typeof body?.courierName === "string" && body.courierName.trim()
          ? body.courierName.trim()
          : null;

      for (const order of targets) {
        const values: Partial<typeof orders.$inferInsert> = { status: "Shipped" };
        if (!order.trackingNumber) values.trackingNumber = generateTrackingNumber();
        if (courier) values.courierName = courier;

        await db
          .update(orders)
          .set(values)
          .where(and(eq(orders.id, order.id), eq(orders.storeId, store.id)));
      }

      return NextResponse.json({ updated: orderIds.length });
    }

    return NextResponse.json(
      { error: "Unknown action", code: "INVALID_ACTION" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Shipping action error:", error);
    return createErrorResponse(error, "Failed to update shipping queue");
  }
}

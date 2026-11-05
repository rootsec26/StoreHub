import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orderItems,
  orders,
  orderStatusLogs,
  shippingIntegrations,
  shippingZones,
  stores,
} from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { resolveStoreAccess, getSession } from "@/lib/auth";
import { createErrorResponse, formatErrorForLog } from "@/lib/errors";
import { findTransitionPath, normalizeOrderStatus } from "@/lib/order-state-machine";
import { orderStatusNotIn } from "@/lib/order-status-sql";
import {
  FULFILLED_ORDER_STATUSES,
  SHIPMENT_FILTERS,
  estimateDeliveryDate,
  generateTrackingNumber,
  type ShippingLabelStore,
  type ShippingOrderRecord,
} from "@/lib/shipping";

const MAX_BULK_ORDERS = 100;

async function getOwnedStore(sessionId: string) {
  const access = await resolveStoreAccess(sessionId);
  return access?.store;
}

function unfulfilledCondition(storeId: string) {
  return and(
    eq(orders.storeId, storeId),
    orderStatusNotIn(orders.status, FULFILLED_ORDER_STATUSES)
  );
}

/** Shipment buckets that are still moving through a carrier. */
const PENDING_SHIPMENT_STATUSES = [
  "UNFULFILLED",
  "LABEL_CREATED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
] as const;

/** Zeroed metrics returned whenever the summary cannot be computed. */
const EMPTY_SHIPPING_SUMMARY = {
  unfulfilledCount: 0,
  totalShipments: 0,
  pending: 0,
};

interface CarrierHealth {
  /** Carrier accounts that actually hold an API key. */
  configured: number;
  /** Carrier accounts toggled on. */
  active: number;
  /** True when at least one active account holds credentials. */
  connected: boolean;
}

/**
 * Best-effort carrier health: which carrier accounts hold keys and are
 * enabled. Never throws — a missing `shipping_integrations` table or an
 * unreachable provider only reports "not connected".
 */
async function getCarrierHealth(storeId: string): Promise<CarrierHealth> {
  try {
    const rows = await db
      .select({
        apiKey: shippingIntegrations.apiKey,
        isActive: shippingIntegrations.isActive,
      })
      .from(shippingIntegrations)
      .where(eq(shippingIntegrations.storeId, storeId));

    const withKeys = rows.filter((row) => Boolean(row.apiKey?.trim()));
    return {
      configured: withKeys.length,
      active: rows.filter((row) => row.isActive).length,
      connected: withKeys.some((row) => row.isActive),
    };
  } catch (error) {
    console.error(
      `[api/shipping?summary=1] carrier integration check failed (continuing without carrier metrics): ${formatErrorForLog(
        error,
        { includeStack: false }
      )}`
    );
    return { configured: 0, active: 0, connected: false };
  }
}

/**
 * Sidebar badge metrics (`GET /api/shipping?summary=1`).
 *
 * Safe by construction: missing carrier keys, an unmigrated
 * `shipping_integrations` table or an unreachable database all degrade to the
 * empty metrics object with HTTP 200 instead of a 5xx that would break the
 * dashboard shell. Every failure is logged with `console.error`.
 */
async function getShippingSummary(sessionId: string): Promise<NextResponse> {
  try {
    const store = await getOwnedStore(sessionId);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const [unfulfilledRows, totalRows, pendingRows] = await Promise.all([
      db
        .select({ value: sql<number | null>`count(*)::int` })
        .from(orders)
        .where(unfulfilledCondition(store.id)),
      db
        .select({ value: sql<number | null>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, store.id),
            isNotNull(orders.carrierName)
          )
        ),
      db
        .select({ value: sql<number | null>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, store.id),
            isNotNull(orders.carrierName),
            inArray(orders.shippingStatus, [...PENDING_SHIPMENT_STATUSES])
          )
        ),
    ]);

    const carriers = await getCarrierHealth(store.id);

    const countOf = (rows: { value: number | null }[] | undefined): number =>
      Number(rows?.[0]?.value ?? 0) || 0;

    return NextResponse.json({
      unfulfilledCount: countOf(unfulfilledRows),
      totalShipments: countOf(totalRows),
      pending: countOf(pendingRows),
      carriers,
    });
  } catch (error) {
    console.error(
      `[api/shipping?summary=1] summary query failed, returning fallback metrics: ${formatErrorForLog(
        error
      )}`
    );
    return NextResponse.json({ ...EMPTY_SHIPPING_SUMMARY, degraded: true });
  }
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
  zoneDays: number | null,
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
    carrierName: row.carrierName ?? null,
    shippingStatus: row.shippingStatus ?? "UNFULFILLED",
    airwayBillUrl: row.airwayBillUrl ?? null,
    estimatedDeliveryAt:
      (normalizeOrderStatus(row.status) ?? row.status) === "CANCELLED"
        ? null
        : estimateDeliveryDate(
            { createdAt: row.createdAt, zoneDays },
            row.carrierName || row.courierName
          ).toISOString(),
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

    // Sidebar badge: answered from a hardened path that can never 5xx.
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return await getShippingSummary(session.id);
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const filter = request.nextUrl.searchParams.get("filter") || "";
    const bucket = Object.prototype.hasOwnProperty.call(SHIPMENT_FILTERS, filter)
      ? (filter as keyof typeof SHIPMENT_FILTERS)
      : null;

    let condition = unfulfilledCondition(store.id);
    if (filter === "all") {
      condition = eq(orders.storeId, store.id);
    } else if (bucket === "ready") {
      condition = and(
        eq(orders.storeId, store.id),
        eq(orders.shippingStatus, "UNFULFILLED"),
        orderStatusNotIn(orders.status, ["DELIVERED", "CANCELLED"])
      );
    } else if (bucket) {
      condition = and(
        eq(orders.storeId, store.id),
        inArray(orders.shippingStatus, [...SHIPMENT_FILTERS[bucket]])
      );
    }

    const rows = await db
      .select({
        order: orders,
        zoneName: shippingZones.zoneName,
        zoneDays: shippingZones.estimatedDeliveryDays,
      })
      .from(orders)
      .leftJoin(shippingZones, eq(orders.shippingZoneId, shippingZones.id))
      .where(condition)
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
      normalizeOrder(row.order, row.zoneName, row.zoneDays, counts.get(row.order.id) ?? 0)
    );

    const summary = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orders)
      .where(unfulfilledCondition(store.id));
    const ready = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, store.id),
          eq(orders.shippingStatus, "UNFULFILLED"),
          orderStatusNotIn(orders.status, ["DELIVERED", "CANCELLED"])
        )
      );
    const transit = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, store.id),
          inArray(orders.shippingStatus, [...SHIPMENT_FILTERS.transit])
        )
      );
    const delivered = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, store.id),
          inArray(orders.shippingStatus, [...SHIPMENT_FILTERS.delivered])
        )
      );

    return NextResponse.json({
      store: toLabelStore(store),
      orders: list,
      unfulfilledCount: summary[0]?.value ?? list.length,
      counts: {
        ready: ready[0]?.value ?? 0,
        transit: transit[0]?.value ?? 0,
        delivered: delivered[0]?.value ?? 0,
      },
      filter: bucket ?? (filter || "ready"),
    });
  } catch (error) {
    console.error(
      `[api/shipping] GET failed for store queue: ${formatErrorForLog(error)}`
    );
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
        orders: targets.map((order) => normalizeOrder(order, null, null, 0)),
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
      const ipAddress =
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        "unknown";

      let updated = 0;
      const skipped: { orderId: string; code: string }[] = [];

      for (const order of targets) {
        const current = normalizeOrderStatus(order.status);
        if (!current || !findTransitionPath(current, "SHIPPED")) {
          skipped.push({ orderId: order.id, code: "INVALID_TRANSITION" });
          continue;
        }

        const values: Partial<typeof orders.$inferInsert> = { status: "SHIPPED" };
        if (!order.trackingNumber) values.trackingNumber = generateTrackingNumber();
        if (courier) values.courierName = courier;

        await db.transaction(async (tx) => {
          const applied = await tx
            .update(orders)
            .set(values)
            .where(and(eq(orders.id, order.id), eq(orders.storeId, store.id)))
            .returning({ id: orders.id });

          if (applied.length === 0) return;

          if (current !== "SHIPPED") {
            await tx.insert(orderStatusLogs).values({
              orderId: order.id,
              storeId: store.id,
              previousStatus: order.status,
              newStatus: "SHIPPED",
              changedByUserId: session.id,
              ipAddress,
            });
          }

          updated += 1;
        });
      }

      return NextResponse.json({ updated, skipped });
    }

    return NextResponse.json(
      { error: "Unknown action", code: "INVALID_ACTION" },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      `[api/shipping] PATCH failed for bulk action: ${formatErrorForLog(error)}`
    );
    return createErrorResponse(error, "Failed to update shipping queue");
  }
}

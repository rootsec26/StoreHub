import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderItems,
  orderStatusLogs,
  orders,
  shippingIntegrations,
  shippingZones,
  stores,
} from "@/db/schema";
import {
  CARRIER_PROFILES,
  detectGovernorate,
  resolveCarrierRoute,
  shipmentTrackingPath,
} from "@/lib/shipping";
import {
  createCarrierShipment,
  toCarrierAccount,
  type CarrierAccount,
} from "@/lib/shipping-carriers";
import { absoluteUrl } from "@/lib/site";

/**
 * Auto-routing fulfillment engine.
 *
 * For every requested order it resolves the destination governorate, picks the
 * merchant's carrier account for that region, books the shipment (real carrier
 * API or mock provider), then stamps tracking + AWB links on the order.
 */

export const MAX_FULFILL_BATCH = 100;
/** Orders booked per wave so bulk runs never starve the pg pool. */
const CONCURRENCY = 5;

export interface FulfillmentSuccess {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  carrierLabel: string;
  governorate: string | null;
  routingReason: "governorate" | "fallback" | "default";
  shippingStatus: string;
  awbUrl: string;
  trackingUrl: string;
  source: "carrier" | "mock" | "existing";
  alreadyFulfilled: boolean;
}

export interface FulfillmentFailure {
  orderId: string;
  error: string;
}

export interface FulfillmentOutcome {
  results: FulfillmentSuccess[];
  failures: FulfillmentFailure[];
}

interface StoreBranding {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  accentColor: string | null;
  currency: string | null;
}

async function loadStore(storeId: string): Promise<StoreBranding | null> {
  const rows = await db
    .select({
      id: stores.id,
      name: stores.name,
      slug: stores.slug,
      address: stores.address,
      phone: stores.phone,
      accentColor: stores.accentColor,
      currency: stores.currency,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  return rows[0] ?? null;
}

async function countOrderItems(orderId: string): Promise<number> {
  try {
    const rows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    return rows[0]?.total ?? 0;
  } catch {
    return 0;
  }
}

async function bookOrder(
  store: StoreBranding,
  order: typeof orders.$inferSelect,
  zone: { name: string | null; days: number | null },
  integrations: Awaited<ReturnType<typeof loadIntegrations>>
): Promise<FulfillmentSuccess> {
  const governorate = detectGovernorate(order.customerAddress, zone.name);
  const decision = resolveCarrierRoute(integrations, governorate);
  const profile = CARRIER_PROFILES[decision.carrier];

  let trackingNumber = order.trackingNumber ?? "";
  let source: FulfillmentSuccess["source"] = "existing";

  if (!trackingNumber) {
    const account: CarrierAccount = decision.integration
      ? toCarrierAccount(decision.integration)
      : { carrier: decision.carrier, apiKey: "", apiSecret: "" };

    const shipment = await createCarrierShipment(account, {
      reference: order.id,
      recipient: {
        name: order.customerName,
        phone: order.customerPhone || "",
        address: order.customerAddress || "",
        governorate: governorate || "Egypt",
      },
      sender: {
        name: store.name,
        address: store.address || "",
        phone: store.phone || "",
      },
      codAmount: Number(order.totalAmount) || 0,
      itemsCount: await countOrderItems(order.id),
      notes: order.notes || undefined,
    });

    trackingNumber = shipment.trackingNumber;
    source = shipment.source;
  }

  const awbUrl = absoluteUrl(`/api/shipping/awb/${order.id}`);
  const trackingUrl = absoluteUrl(shipmentTrackingPath(store.slug, order.id));
  const nextShippingStatus =
    order.shippingStatus === "UNFULFILLED" ? "LABEL_CREATED" : order.shippingStatus;
  const nextOrderStatus =
    order.status === "Completed" || order.status === "Cancelled"
      ? order.status
      : "Shipped";

  const updated = await db
    .update(orders)
    .set({
      trackingNumber,
      carrierName: decision.carrier,
      courierName: profile.label,
      airwayBillUrl: awbUrl,
      shippingStatus: nextShippingStatus,
      status: nextOrderStatus,
    })
    .where(and(eq(orders.id, order.id), eq(orders.storeId, store.id)))
    .returning();

  const saved = updated[0] ?? order;
  if (nextOrderStatus !== order.status) {
    try {
      await db.insert(orderStatusLogs).values({
        orderId: order.id,
        storeId: store.id,
        previousStatus: order.status,
        newStatus: nextOrderStatus,
        changedByUserId: null,
        ipAddress: "shipping-fulfill",
      });
    } catch (error) {
      console.error("Fulfillment audit log failed:", error);
    }
  }

  return {
    orderId: order.id,
    trackingNumber: saved.trackingNumber ?? trackingNumber,
    carrier: decision.carrier,
    carrierLabel: profile.label,
    governorate,
    routingReason: decision.reason,
    shippingStatus: saved.shippingStatus ?? nextShippingStatus,
    awbUrl,
    trackingUrl,
    source,
    alreadyFulfilled: Boolean(order.trackingNumber),
  };
}

async function loadIntegrations(storeId: string) {
  try {
    return await db
      .select()
      .from(shippingIntegrations)
      .where(eq(shippingIntegrations.storeId, storeId));
  } catch (error) {
    console.error("Failed to load carrier integrations (table missing?):", error);
    return [];
  }
}

/** Books shipments for the given orders and returns per-order outcomes. */
export async function fulfillOrderBatch(params: {
  storeId: string;
  orderIds: string[];
}): Promise<FulfillmentOutcome> {
  const store = await loadStore(params.storeId);
  if (!store) {
    return { results: [], failures: params.orderIds.map((id) => ({ orderId: id, error: "Store not found" })) };
  }

  const rows = await db
    .select({
      order: orders,
      zoneName: shippingZones.zoneName,
      zoneDays: shippingZones.estimatedDeliveryDays,
    })
    .from(orders)
    .leftJoin(shippingZones, eq(orders.shippingZoneId, shippingZones.id))
    .where(and(inArray(orders.id, params.orderIds), eq(orders.storeId, params.storeId)));

  const found = new Map(rows.map((row) => [row.order.id, row]));
  const results: FulfillmentSuccess[] = [];
  const failures: FulfillmentFailure[] = [];

  for (const orderId of params.orderIds) {
    if (!found.has(orderId)) {
      failures.push({ orderId, error: "Order not found in your store" });
    }
  }

  const integrations = await loadIntegrations(params.storeId);
  const queue = rows.map((row) => row.order.id);

  for (let index = 0; index < queue.length; index += CONCURRENCY) {
    const wave = queue.slice(index, index + CONCURRENCY);
    const outcomes = await Promise.allSettled(
      wave.map((orderId) => {
        const row = found.get(orderId);
        if (!row) return Promise.reject(new Error("Order not found"));
        return bookOrder(
          store,
          row.order,
          { name: row.zoneName, days: row.zoneDays },
          integrations
        );
      })
    );

    outcomes.forEach((outcome, offset) => {
      const orderId = wave[offset];
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        failures.push({
          orderId,
          error: outcome.reason instanceof Error ? outcome.reason.message : "Fulfillment failed",
        });
      }
    });
  }

  return { results, failures };
}

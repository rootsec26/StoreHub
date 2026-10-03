import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, shippingZones, stores } from "@/db/schema";
import { carrierLabel, detectGovernorate, shipmentTrackingPath } from "@/lib/shipping";
import { absoluteUrl } from "@/lib/site";
import type { AwbLabelData } from "@/lib/shipping-pdf";

/** Order + store branding + zone info needed to render one airway bill. */
export interface AwbContext {
  order: typeof orders.$inferSelect;
  itemsCount: number;
  store: {
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    accentColor: string | null;
    currency: string | null;
  };
  zoneName: string | null;
  zoneDays: number | null;
}

export async function fetchAwbContext(
  storeId: string,
  orderId: string
): Promise<AwbContext | null> {
  const rows = await db
    .select({
      order: orders,
      zoneName: shippingZones.zoneName,
      zoneDays: shippingZones.estimatedDeliveryDays,
      storeName: stores.name,
      storeSlug: stores.slug,
      storeAddress: stores.address,
      storePhone: stores.phone,
      storeAccent: stores.accentColor,
      storeCurrency: stores.currency,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .leftJoin(shippingZones, eq(shippingZones.id, orders.shippingZoneId))
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  let itemsCount = 0;
  try {
    const counts = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    itemsCount = counts[0]?.total ?? 0;
  } catch {
    itemsCount = 0;
  }

  return {
    order: row.order,
    itemsCount,
    store: {
      name: row.storeName,
      slug: row.storeSlug,
      address: row.storeAddress,
      phone: row.storePhone,
      accentColor: row.storeAccent,
      currency: row.storeCurrency,
    },
    zoneName: row.zoneName,
    zoneDays: row.zoneDays,
  };
}

export function buildAwbLabel(context: AwbContext): AwbLabelData {
  const { order, store } = context;
  const destination =
    detectGovernorate(order.customerAddress, context.zoneName) ||
    context.zoneName ||
    "Egypt";

  return {
    storeName: store.name,
    storeAddress: store.address,
    storePhone: store.phone,
    accent: store.accentColor,
    carrierLabel: carrierLabel(order.carrierName || order.courierName),
    orderReference: order.id.slice(0, 8).toUpperCase(),
    trackingNumber: order.trackingNumber || `PENDING-${order.id.slice(0, 8).toUpperCase()}`,
    recipientName: order.customerName,
    recipientPhone: order.customerPhone || "",
    recipientAddress: order.customerAddress || "",
    destination,
    codAmount: Number(order.totalAmount) || 0,
    currency: store.currency || "EGP",
    itemsCount: context.itemsCount,
    trackingUrl: absoluteUrl(shipmentTrackingPath(store.slug, order.id)),
  };
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders, products, shippingZones, stores } from "@/db/schema";
import { absoluteUrl } from "@/lib/site";
import { isValidOrderId } from "@/lib/order-tracking";
import { hasFeatureAccess } from "@/lib/paywall";
import { shipmentTrackingPath, summarizeShipment } from "@/lib/shipping";
import { verifyOrderToken } from "@/lib/order-tokens";
import { isAuthenticatedStoreOwner } from "@/lib/orders/order-access";
import TrackingPortal, {
  type TrackingOrderData,
  type TrackingStoreData,
} from "./tracking-portal";

interface TrackingPageProps {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ token?: string; order_token?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: TrackingPageProps): Promise<Metadata> {
  const { slug, orderId } = await params;
  return {
    title: "Track Order",
    description: `Live shipment tracking for order ${orderId.slice(0, 8)} at ${slug}.`,
    alternates: { canonical: absoluteUrl(shipmentTrackingPath(slug, orderId)) },
    robots: { index: false, follow: true },
  };
}

async function fetchTrackingData(slug: string, orderId: string, token?: string) {
  const storeRows = await db
    .select({
      id: stores.id,
      name: stores.name,
      slug: stores.slug,
      logoUrl: stores.logoUrl,
      phone: stores.phone,
      address: stores.address,
      accentColor: stores.accentColor,
      currency: stores.currency,
      supportedCurrencies: stores.supportedCurrencies,
      hasWhiteLabel: stores.hasWhiteLabel,
    })
    .from(stores)
    .where(eq(stores.slug, slug))
    .limit(1);

  const store = storeRows[0];
  if (!store) return null;

  const orderRows = await db
    .select({
      order: orders,
      zoneDays: shippingZones.estimatedDeliveryDays,
    })
    .from(orders)
    .leftJoin(shippingZones, eq(shippingZones.id, orders.shippingZoneId))
    .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
    .limit(1);

  const row = orderRows[0];
  if (!row) return null;

  const tokenPayload = token
    ? verifyOrderToken(token, { orderId: row.order.id, purpose: "track" })
    : null;
  const fullAccess = Boolean(
    tokenPayload || (await isAuthenticatedStoreOwner(store.id))
  );

  const itemRows = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      productName: products.name,
      imageUrl: products.imageUrl,
    })
    .from(orderItems)
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, row.order.id));

  const storeData: TrackingStoreData = {
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl || null,
    phone: store.phone || null,
    address: store.address || null,
    accentColor: store.accentColor || null,
    currency: store.currency || "EGP",
    supportedCurrencies:
      (store.supportedCurrencies as string[] | null)?.filter(
        (entry): entry is string => typeof entry === "string"
      ) ?? ["EGP"],
    hasWhiteLabel: store.hasWhiteLabel
      ? await hasFeatureAccess(store.id, "white_label")
      : false,
  };

  const orderData: TrackingOrderData = {
    id: row.order.id,
    status: row.order.status,
    createdAt: row.order.createdAt.toISOString(),
    totalAmount: String(row.order.totalAmount),
    customerName: fullAccess ? row.order.customerName : "Customer",
    customerAddress: fullAccess ? row.order.customerAddress || null : null,
    shipping: summarizeShipment(row.order, row.zoneDays),
    items: itemRows.map((item) => ({
      id: item.id,
      name: item.productName || null,
      imageUrl: item.imageUrl || null,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    })),
  };

  return {
    store: storeData,
    order: orderData,
    // Only forward a token that actually authorized full access; a random
    // query value must not end up in the polling URL.
    token: fullAccess ? token : undefined,
  };
}

export default async function StoreOrderTrackingPage({
  params,
  searchParams,
}: TrackingPageProps) {
  const { slug, orderId } = await params;
  const { token, order_token } = await searchParams;

  if (!isValidOrderId(orderId)) notFound();

  let data: Awaited<ReturnType<typeof fetchTrackingData>> = null;
  try {
    data = await fetchTrackingData(slug, orderId, token || order_token);
  } catch (error) {
    console.error(`Failed to load tracking page for ${slug}/${orderId}:`, error);
  }

  if (!data) notFound();

  return (
    <TrackingPortal store={data.store} order={data.order} token={data.token} />
  );
}

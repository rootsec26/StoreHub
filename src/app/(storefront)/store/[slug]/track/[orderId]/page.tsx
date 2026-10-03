import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders, products, shippingZones, stores } from "@/db/schema";
import { absoluteUrl } from "@/lib/site";
import { isValidOrderId } from "@/lib/order-tracking";
import { shipmentTrackingPath, summarizeShipment } from "@/lib/shipping";
import TrackingPortal, {
  type TrackingOrderData,
  type TrackingStoreData,
} from "./tracking-portal";

interface TrackingPageProps {
  params: Promise<{ slug: string; orderId: string }>;
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

async function fetchTrackingData(slug: string, orderId: string) {
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
    hasWhiteLabel: store.hasWhiteLabel === true,
  };

  const orderData: TrackingOrderData = {
    id: row.order.id,
    status: row.order.status,
    createdAt: row.order.createdAt.toISOString(),
    totalAmount: String(row.order.totalAmount),
    customerName: row.order.customerName,
    customerAddress: row.order.customerAddress || null,
    shipping: summarizeShipment(row.order, row.zoneDays),
    items: itemRows.map((item) => ({
      id: item.id,
      name: item.productName || null,
      imageUrl: item.imageUrl || null,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    })),
  };

  return { store: storeData, order: orderData };
}

export default async function StoreOrderTrackingPage({ params }: TrackingPageProps) {
  const { slug, orderId } = await params;

  if (!isValidOrderId(orderId)) notFound();

  let data: Awaited<ReturnType<typeof fetchTrackingData>> = null;
  try {
    data = await fetchTrackingData(slug, orderId);
  } catch (error) {
    console.error(`Failed to load tracking page for ${slug}/${orderId}:`, error);
  }

  if (!data) notFound();

  return <TrackingPortal store={data.store} order={data.order} />;
}

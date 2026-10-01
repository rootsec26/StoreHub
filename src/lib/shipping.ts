import { trackOrderPath } from "@/lib/order-tracking";

/** Order statuses that still need labels / dispatch (not yet fulfilled). */
export const UNFULFILLED_ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
] as const;

/** Statuses that close an order out of the fulfillment queue. */
export const FULFILLED_ORDER_STATUSES = [
  "Shipped",
  "Completed",
  "Cancelled",
] as const;

/** Common couriers offered in the bulk "Mark as Shipped" toolbar. */
export const COURIER_OPTIONS = [
  "Bosta",
  "Aramex",
  "iMile",
  "Mylerz",
  "White Bird",
  "SMSA",
  "DHL",
] as const;

export interface ShippingZoneRecord {
  id: string;
  storeId: string;
  zoneName: string;
  rate: string;
  estimatedDeliveryDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShippingOrderRecord {
  id: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  totalAmount: string;
  status: string;
  shippingZoneId: string | null;
  trackingNumber: string | null;
  courierName: string | null;
  labelPrintedAt: string | null;
  createdAt: string;
  /** Joined from `shipping_zones`, null when unassigned. */
  zoneName: string | null;
  /** Number of line items on the order. */
  itemsCount: number;
}

export interface ShippingLabelStore {
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
}

/** Suggested Egyptian presets offered when a store has no zones yet. */
export const ZONE_PRESETS: {
  name: string;
  rate: number;
  days: number;
}[] = [
  { name: "Cairo", rate: 50, days: 1 },
  { name: "Alexandria", rate: 70, days: 2 },
  { name: "Upper Egypt", rate: 90, days: 3 },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Human-scannable tracking code, e.g. `SH261001K7X9Q2`.
 * Digits + uppercase keeps it Code128 friendly and easy to read aloud.
 */
export function generateTrackingNumber(prefix = "SH"): string {
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  return `${prefix}${stamp}${random}`;
}

/** Absolute URL of the customer-facing live tracking page for an order. */
export function buildTrackingUrl(origin: string, storeSlug: string, orderId: string): string {
  return `${origin}${trackOrderPath(storeSlug, orderId)}`;
}

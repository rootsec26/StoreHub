import { normalizeOrderStatus } from "@/lib/order-state-machine";

export interface TrackOrderProduct {
  id: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  imageUrl: string | null;
  categoryId: string | null;
  isVisible: boolean;
}

export interface TrackOrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  product: TrackOrderProduct | null;
}

export interface TrackedOrder {
  id: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalAmount: string;
  status: string;
  createdAt: string;
  items: TrackOrderItem[];
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paymentProofStatus?: string | null;
  paymentProofSubmittedAt?: string | null;
}

export interface StorefrontStore {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  phone: string;
  address: string;
  accentColor: string;
  currency: string;
  supportedCurrencies: string[];
  /** White-label add-on: hides the "Powered by StoreHub" credit. */
  hasWhiteLabel?: boolean;
}

export type TrackingStepKey = "received" | "processing" | "shipped" | "delivered";

export const TRACKING_STEP_KEYS: readonly TrackingStepKey[] = [
  "received",
  "processing",
  "shipped",
  "delivered",
] as const;

const STATUS_STEP_INDEX: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  READY: 2,
  SHIPPED: 2,
  DELIVERED: 3,
};

export function getTrackingStepIndex(status: string): number {
  // Normalize legacy spellings first ("Pending" → PENDING, "Completed" → DELIVERED).
  const canonical = normalizeOrderStatus(status) ?? status;
  return STATUS_STEP_INDEX[canonical] ?? 0;
}

export function isFinalOrderStatus(status: string): boolean {
  const canonical = normalizeOrderStatus(status);
  return canonical === "DELIVERED" || canonical === "CANCELLED";
}

export const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PHONE_PATTERN = /^\+?[\d\s()-]{6,20}$/;

export function isValidOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value.trim());
}

/**
 * Customer-facing tracking code derived from the order UUID, e.g.
 * `ORD-8F92A1B3`. Short, memorable and safe to read over the phone.
 */
export function orderTrackingCode(orderId: string): string {
  const hex = orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ORD-${hex}`;
}

/** Accepts `ORD-XXXXXXXX`, `ord-xxxxxxxx`, or a bare hex prefix. */
export function isValidTrackingCode(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:ord-)?[0-9a-f]{4,32}$/i.test(trimmed);
}

/**
 * Normalizes a customer-entered lookup value into a hex prefix that can be
 * matched against `replace(orders.id::text, '-', '')`. Returns "" when the
 * value is not a plausible order id / tracking code.
 */
export function trackingCodePrefix(value: string): string {
  const trimmed = value.trim().replace(/^ord-/i, "");
  if (!/^[0-9a-f-]{4,36}$/i.test(trimmed)) return "";
  const hex = trimmed.replace(/-/g, "");
  return /^[0-9a-f]+$/i.test(hex) ? hex.toLowerCase() : "";
}

export function isValidPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_PATTERN.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function trackOrderPath(slug: string, orderId?: string): string {
  const base = `/store/${slug}/track-order`;
  return orderId ? `${base}?id=${encodeURIComponent(orderId)}` : base;
}

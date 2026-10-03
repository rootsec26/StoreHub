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
  Pending: 0,
  Confirmed: 1,
  Preparing: 1,
  Ready: 2,
  Shipped: 2,
  Completed: 3,
};

export function getTrackingStepIndex(status: string): number {
  return STATUS_STEP_INDEX[status] ?? 0;
}

export function isFinalOrderStatus(status: string): boolean {
  return status === "Completed" || status === "Cancelled";
}

export const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PHONE_PATTERN = /^\+?[\d\s()-]{6,20}$/;

export function isValidOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value.trim());
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

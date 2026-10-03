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

// ============================================
// MULTI-CARRIER ROUTING ENGINE
// ============================================

/** Carriers a store can connect to shipping_integrations. */
export const SHIPPING_CARRIERS = [
  "BOSTA",
  "MYLERZ",
  "ARAMEX",
  "TURBO",
  "CUSTOM",
] as const;

export type ShippingCarrier = (typeof SHIPPING_CARRIERS)[number];

/** Human label + tracking prefix + typical transit time per carrier. */
export const CARRIER_PROFILES: Record<
  ShippingCarrier,
  { label: string; prefix: string; transitDays: number }
> = {
  BOSTA: { label: "Bosta", prefix: "BOS", transitDays: 2 },
  MYLERZ: { label: "Mylerz", prefix: "MYL", transitDays: 2 },
  ARAMEX: { label: "Aramex", prefix: "ARX", transitDays: 3 },
  TURBO: { label: "Turbo", prefix: "TRB", transitDays: 1 },
  CUSTOM: { label: "Custom Courier", prefix: "SH", transitDays: 3 },
};

export function isShippingCarrier(value: unknown): value is ShippingCarrier {
  return (
    typeof value === "string" &&
    (SHIPPING_CARRIERS as readonly string[]).includes(value)
  );
}

export function carrierLabel(carrier: string | null | undefined): string {
  if (isShippingCarrier(carrier)) return CARRIER_PROFILES[carrier].label;
  return carrier || "";
}

/** Live shipment lifecycle stored in orders.shipping_status. */
export const SHIPPING_STATUSES = [
  "UNFULFILLED",
  "LABEL_CREATED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
] as const;

export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

export function isShippingStatus(value: unknown): value is ShippingStatus {
  return (
    typeof value === "string" &&
    (SHIPPING_STATUSES as readonly string[]).includes(value)
  );
}

/** Dashboard hub filters → shipping statuses covered by each bucket. */
export const SHIPMENT_FILTERS: Record<
  "ready" | "transit" | "delivered",
  readonly ShippingStatus[]
> = {
  ready: ["UNFULFILLED"],
  transit: ["LABEL_CREATED", "PICKED_UP", "OUT_FOR_DELIVERY"],
  delivered: ["DELIVERED", "RETURNED"],
};

/** Public 5-step progress bar shown on the branded tracking page. */
export const TRACKING_PROGRESS_STEPS = [
  "placed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

export type TrackingProgressStep = (typeof TRACKING_PROGRESS_STEPS)[number];

/**
 * Maps an order + shipment state onto the public 5-step timeline:
 * Order Placed → Preparing → Shipped → Out for Delivery → Delivered.
 */
export function getShipmentProgressIndex(order: {
  status: string;
  shippingStatus?: string | null;
}): number {
  if (order.status === "Completed") return 4;
  if (order.status === "Cancelled") return 4;

  const shipping = order.shippingStatus ?? "UNFULFILLED";
  if (shipping === "DELIVERED") return 4;
  if (shipping === "OUT_FOR_DELIVERY") return 3;
  if (shipping === "PICKED_UP" || shipping === "LABEL_CREATED") return 2;
  if (shipping === "RETURNED") return 4;

  // No label yet: fall back to the merchant-facing order status.
  if (order.status === "Shipped" || order.status === "Ready") return 2;
  if (order.status === "Pending") return 0;
  return 1;
}

export function getShipmentProgressStep(order: {
  status: string;
  shippingStatus?: string | null;
}): TrackingProgressStep {
  return TRACKING_PROGRESS_STEPS[getShipmentProgressIndex(order)];
}

/** Public shipping block shared by the tracking page and its poll API. */
export interface ShipmentSummary {
  status: string;
  carrier: string | null;
  carrierLabel: string;
  trackingNumber: string | null;
  estimatedDeliveryAt: string | null;
  progressIndex: number;
  stepKey: TrackingProgressStep;
}

export function summarizeShipment(
  order: {
    status: string;
    shippingStatus?: string | null;
    carrierName?: string | null;
    courierName?: string | null;
    trackingNumber?: string | null;
    createdAt: string | Date;
  },
  zoneDays?: number | null
): ShipmentSummary {
  const carrier = order.carrierName || order.courierName || null;
  return {
    status: order.shippingStatus || "UNFULFILLED",
    carrier,
    carrierLabel: carrierLabel(carrier),
    trackingNumber: order.trackingNumber ?? null,
    estimatedDeliveryAt:
      order.status === "Cancelled"
        ? null
        : estimateDeliveryDate(
            { createdAt: order.createdAt, zoneDays },
            carrier
          ).toISOString(),
    progressIndex: getShipmentProgressIndex(order),
    stepKey: getShipmentProgressStep(order),
  };
}

/** Estimated delivery = created + carrier transit days (zone days win). */
export function estimateDeliveryDate(
  order: { createdAt: string | Date; zoneDays?: number | null },
  carrier: string | null | undefined
): Date {
  const created = new Date(order.createdAt);
  const fallbackDays = isShippingCarrier(carrier)
    ? CARRIER_PROFILES[carrier].transitDays
    : CARRIER_PROFILES.CUSTOM.transitDays;
  const days =
    typeof order.zoneDays === "number" && order.zoneDays > 0
      ? order.zoneDays
      : fallbackDays;
  const eta = new Date(created.getTime());
  eta.setDate(eta.getDate() + days);
  return eta;
}

// ---------------------------------------------
// Governorate detection & carrier resolution
// ---------------------------------------------

interface GovernorateAlias {
  name: string;
  aliases: string[];
}

/** Egyptian governorates + the spellings we match in free-text addresses. */
export const GOVERNORATES: GovernorateAlias[] = [
  { name: "Cairo", aliases: ["cairo", "القاهرة", "القاهره"] },
  { name: "Giza", aliases: ["giza", "الجيزة", "الجيزه", "gizeh"] },
  { name: "Alexandria", aliases: ["alexandria", "الإسكندرية", "الاسكندرية", "alex"] },
  { name: "Qalyubia", aliases: ["qalyubia", "qalyubiya", "القليوبية", "القليوبيه"] },
  { name: "Sharqia", aliases: ["sharqia", "sharkia", "الشرقية"] },
  { name: "Dakahlia", aliases: ["dakahlia", "dakahliya", "الدقهلية"] },
  { name: "Damietta", aliases: ["damietta", "دمياط"] },
  { name: "Beheira", aliases: ["beheira", "behera", "البحيرة", "البحيره"] },
  { name: "Kafr El Sheikh", aliases: ["kafr el sheikh", "kafr al shaykh", "كفر الشيخ", "كفر الشيخ"] },
  { name: "Gharbia", aliases: ["gharbia", "gharbeya", "الغربية"] },
  { name: "Monufia", aliases: ["monufia", "menoufia", "المنوفية"] },
  { name: "Ismailia", aliases: ["ismailia", "الإسماعيلية", "الاسماعيلية"] },
  { name: "Suez", aliases: ["suez", "السويس"] },
  { name: "Port Said", aliases: ["port said", "بورسعيد"] },
  { name: "North Sinai", aliases: ["north sinai", "شمال سيناء"] },
  { name: "South Sinai", aliases: ["south sinai", "جنوب سيناء"] },
  { name: "Red Sea", aliases: ["red sea", "البحر الأحمر", "البحر الاحمر"] },
  { name: "New Valley", aliases: ["new valley", "الوادي الجديد", "الوادى الجديد"] },
  { name: "Matrouh", aliases: ["matrouh", "marsa matruh", "مطروح"] },
  { name: "Fayoum", aliases: ["fayoum", "faiyum", "الفيوم"] },
  { name: "Beni Suef", aliases: ["beni suef", "beni suif", "بني سويف"] },
  { name: "Minya", aliases: ["minya", "المنيا"] },
  { name: "Assiut", aliases: ["assiut", "asyut", "أسيوط", "اسيوط"] },
  { name: "Sohag", aliases: ["sohag", "سوهاج"] },
  { name: "Qena", aliases: ["qena", "kena", "قنا"] },
  { name: "Luxor", aliases: ["luxor", "الأقصر", "الاقصر"] },
  { name: "Aswan", aliases: ["aswan", "أسوان", "اسوان"] },
];

/** Folds Arabic variants + casing so "القاهره" matches "القاهرة". */
function normalizeDestination(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort governorate lookup from the shipping zone name and the raw
 * customer address (orders carry no structured destination column).
 */
export function detectGovernorate(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const haystack = normalizeDestination(candidate);
    for (const governorate of GOVERNORATES) {
      for (const alias of governorate.aliases) {
        if (haystack.includes(normalizeDestination(alias))) {
          return governorate.name;
        }
      }
    }
  }
  return null;
}

/** Minimal shape of a carrier account used by the router. */
export interface CarrierRouteCandidate {
  id: string;
  carrier: string;
  isActive: boolean;
  defaultForGovernorates: string[] | null;
}

export interface CarrierRoutingDecision {
  integration: CarrierRouteCandidate | null;
  /** Carrier code to stamp on the order even without an integration row. */
  carrier: ShippingCarrier;
  governorate: string | null;
  reason: "governorate" | "fallback" | "default";
}

/**
 * Picks the carrier account for a destination:
 *  1. active integration whose `default_for_governorates` contains the target,
 *  2. otherwise the store's first active integration (its default carrier),
 *  3. otherwise a CUSTOM mock route so fulfillment never dead-ends.
 */
export function resolveCarrierRoute<T extends CarrierRouteCandidate>(
  integrations: T[],
  governorate: string | null
): {
  integration: T | null;
  /** Carrier code to stamp on the order even without an integration row. */
  carrier: ShippingCarrier;
  governorate: string | null;
  reason: "governorate" | "fallback" | "default";
} {
  const active = integrations.filter((entry) => entry.isActive);

  if (governorate) {
    const target = normalizeDestination(governorate);
    const matched = active.find((entry) =>
      (entry.defaultForGovernorates ?? []).some(
        (name) => normalizeDestination(name) === target
      )
    );
    if (matched && isShippingCarrier(matched.carrier)) {
      return {
        integration: matched,
        carrier: matched.carrier,
        governorate,
        reason: "governorate",
      };
    }
  }

  const first = active[0];
  if (first && isShippingCarrier(first.carrier)) {
    return {
      integration: first,
      carrier: first.carrier,
      governorate,
      reason: "fallback",
    };
  }

  return {
    integration: null,
    carrier: "CUSTOM",
    governorate,
    reason: "default",
  };
}

/**
 * Normalises free-form carrier webhook payloads into SHIPPING_STATUSES.
 * Accepts BOSTA / Mylerz / Aramex / Turbo style verbs as well as the
 * canonical enum values.
 */
export function mapCarrierStatus(raw: string | null | undefined): ShippingStatus | null {
  if (!raw) return null;
  const value = normalizeDestination(raw).replace(/[_\-.]+/g, " ").trim();

  if (isShippingStatus(raw)) return raw;

  if (/(deliver|تم التسليم|delivered)/.test(value)) return "DELIVERED";
  if (/(return|مرتجع)/.test(value) && !/(not returned)/.test(value)) return "RETURNED";
  if (/(out for delivery|out_for_delivery|منطقة التوصيل|توصيل)/.test(value)) {
    return "OUT_FOR_DELIVERY";
  }
  if (/(pick ?up|picked|pickup|استلام|تم الاستلام)/.test(value)) return "PICKED_UP";
  if (/(transit|moving|shipping|شحن|خرج للتوصيل من المخزن)/.test(value)) {
    return "PICKED_UP";
  }
  if (/(label|created|print|manifest|ready|جاهز|تم انشاء)/.test(value)) {
    return "LABEL_CREATED";
  }
  if (/(unfulfilled|new|pending|جديد)/.test(value)) return "UNFULFILLED";

  return null;
}


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
  /** Multi-carrier routing fields. */
  carrierName: string | null;
  shippingStatus: string;
  airwayBillUrl: string | null;
  /** ISO ETA computed from the delivery zone / carrier transit time. */
  estimatedDeliveryAt: string | null;
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

/** Branded live-tracking page for a specific order (public, no login). */
export function shipmentTrackingPath(slug: string, orderId: string): string {
  return `/store/${slug}/track/${orderId}`;
}

/** Absolute URL of the customer-facing live tracking page for an order. */
export function buildTrackingUrl(origin: string, storeSlug: string, orderId: string): string {
  return `${origin}${shipmentTrackingPath(storeSlug, orderId)}`;
}

/** Legacy lookup page (search by order id / phone). */
export function buildOrderLookupUrl(origin: string, storeSlug: string): string {
  return `${origin}${trackOrderPath(storeSlug)}`;
}

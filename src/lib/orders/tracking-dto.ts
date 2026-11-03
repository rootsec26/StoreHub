import type { orders } from "@/db/schema";

export type TrackedOrderRow = typeof orders.$inferSelect;

/**
 * Minimal public projection used when a caller has neither a signed tracking
 * token nor an authenticated merchant session.
 *
 * The full row contains customer name/phone/address, notes, risk score and
 * payment references. A phone-number lookup or a bare order UUID must not
 * disclose any of that, so those fields are replaced with neutral values while
 * keeping the status/total/items the tracking UI genuinely needs.
 */
export function redactTrackingOrder<T extends TrackedOrderRow>(
  order: T,
  items: unknown
) {
  return {
    id: order.id,
    storeId: order.storeId,
    customerName: "Customer",
    customerPhone: "",
    customerAddress: null,
    notes: null,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt,
    items,
    redacted: true as const,
  };
}

export function buildTrackingOrder<T extends TrackedOrderRow>(
  order: T,
  items: unknown,
  fullAccess: boolean
) {
  if (fullAccess) {
    return { ...order, items, redacted: false as const };
  }
  return redactTrackingOrder(order, items);
}

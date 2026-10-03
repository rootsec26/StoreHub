import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

/**
 * Order State Machine
 *
 * Valid transitions:
 * - Pending → Confirmed, Cancelled
 * - Confirmed → Preparing, Cancelled
 * - Preparing → Ready
 * - Ready → Shipped
 * - Shipped → Completed
 * - Completed → (terminal)
 * - Cancelled → (terminal, unless admin override)
 */

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready"],
  Ready: ["Shipped"],
  Shipped: ["Completed"],
  Completed: [],
  Cancelled: [],
};

/**
 * Check if a status is a valid order status.
 */
export function isValidOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}

/**
 * Check if a status transition is valid.
 * @param from - Current status
 * @param to - Target status
 * @param isAdminOverride - Whether the user has admin override permission (for Cancelled → Completed)
 * @returns true if valid, false otherwise
 */
export function isValidTransition(
  from: OrderStatus,
  to: string,
  isAdminOverride = false
): boolean {
  // Validate target status
  if (!isValidOrderStatus(to)) return false;

  // Same status is always valid (idempotent)
  if (from === to) return true;

  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (allowed.includes(to as OrderStatus)) return true;

  // Admin override: allow Cancelled → Completed
  if (isAdminOverride && from === "Cancelled" && to === "Completed") {
    return true;
  }

  return false;
}

/**
 * Get all valid next statuses for a given status.
 * @param status - Current status
 * @param isAdminOverride - Whether the user has admin override permission
 * @returns Array of valid next statuses
 */
export function getValidNextStatuses(
  status: OrderStatus,
  isAdminOverride = false
): OrderStatus[] {
  const base = VALID_TRANSITIONS[status] ?? [];
  if (isAdminOverride && status === "Cancelled") {
    return [...base, "Completed"];
  }
  return base;
}

/**
 * Check if a status is a terminal state.
 * @param status - Status to check
 * @returns true if terminal
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "Completed" || status === "Cancelled";
}

/**
 * Validate that an order belongs to a store (tenant isolation).
 * @param orderStoreId - Store ID of the order
 * @param sessionStoreId - Store ID from the session
 * @returns true if they match
 */
export function validateStoreAccess(
  orderStoreId: string,
  sessionStoreId: string | undefined
): boolean {
  return sessionStoreId !== undefined && orderStoreId === sessionStoreId;
}

/**
 * Check if user has permission to manage orders.
 * @param role - User's role
 * @returns true if has permission
 */
export function canManageOrders(role?: string): boolean {
  return role === "OWNER" || role === "STAFF_MANAGE_ORDERS";
}

/**
 * Check if user has admin override permission.
 * @param role - User's role
 * @returns true if has admin override
 */
export function hasAdminOverride(role?: string): boolean {
  return role === "OWNER";
}
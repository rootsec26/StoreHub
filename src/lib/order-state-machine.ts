import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

/**
 * Order State Machine
 *
 * Valid transitions:
 * - PENDING → CONFIRMED, CANCELLED
 * - CONFIRMED → PROCESSING, CANCELLED
 * - PROCESSING → READY
 * - READY → SHIPPED
 * - SHIPPED → DELIVERED
 * - DELIVERED → (terminal)
 * - CANCELLED → (terminal, unless admin override)
 */

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY"],
  READY: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * Legacy → canonical status aliases.
 *
 * Historical rows/writers mixed casings and vocabularies:
 *   "Pending" (checkout/DB default), "Cancelled"/"CANCELLED",
 *   "Completed" (POS/legacy = fulfilled), "Preparing", "Shipped", "PENDING".
 * Everything must be interpreted through this map before comparison.
 */
const LEGACY_STATUS_ALIASES: Record<string, OrderStatus> = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  PREPARING: "PROCESSING",
  READY: "READY",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

/**
 * Normalize any stored/observed status value to the canonical uppercase
 * `OrderStatus`. Returns `null` for unknown values (callers must treat the
 * row as "leave it alone" rather than guessing).
 */
export function normalizeOrderStatus(
  raw: string | null | undefined
): OrderStatus | null {
  if (!raw) return null;
  return LEGACY_STATUS_ALIASES[raw.trim().toUpperCase()] ?? null;
}

/**
 * Every stored spelling that means `status` (after upper-casing), used to
 * build SQL predicates that keep working before/after the data backfill:
 *   DELIVERED → ["DELIVERED", "COMPLETED"], PROCESSING → ["PROCESSING", "PREPARING"]
 */
const CANONICAL_VARIANTS: Record<OrderStatus, string[]> = (() => {
  const map = {} as Record<OrderStatus, string[]>;
  for (const status of ORDER_STATUSES) map[status] = [status];
  for (const [legacy, canonical] of Object.entries(LEGACY_STATUS_ALIASES)) {
    if (!map[canonical].includes(legacy)) map[canonical].push(legacy);
  }
  return map;
})();

export function orderStatusVariants(status: OrderStatus): string[] {
  return CANONICAL_VARIANTS[status] ?? [status];
}

/**
 * Canonical status → Title-case label suffix for the `status.*` i18n family
 * (`PENDING` → `status.Pending`). Accepts legacy spellings too.
 */
export function orderStatusTitle(raw: string): string {
  const canonical = normalizeOrderStatus(raw);
  if (!canonical) return raw;
  const lower = canonical.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Canonical status → lowercase suffix for the `orders.status.*` i18n family
 * (`Pending` → `orders.status.pending`).
 */
export function orderStatusLower(raw: string): string {
  const canonical = normalizeOrderStatus(raw);
  return (canonical ?? raw).toLowerCase();
}

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

  // Admin override: allow Cancelled → DELIVERED
  if (isAdminOverride && from === "CANCELLED" && to === "DELIVERED") {
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
  if (isAdminOverride && status === "CANCELLED") {
    return [...base, "DELIVERED"];
  }
  return base;
}

/**
 * Finds a chain of individually-valid transitions that advances `from` all the
 * way to `to`, or `null` when the target is unreachable (terminal states,
 * regressions, cancelled orders).
 *
 * Used by bulk/automatic writers (shipping fulfilment, carrier webhooks) that
 * legitimately jump several states at once: every hop still has to be an edge
 * of `VALID_TRANSITIONS`, so a CANCELLED or DELIVERED order can never be
 * re-opened by a downstream integration.
 */
export function findTransitionPath(
  from: OrderStatus,
  to: OrderStatus,
  isAdminOverride = false
): OrderStatus[] | null {
  if (!isValidOrderStatus(from) || !isValidOrderStatus(to)) return null;
  if (from === to) return [from];
  if (isValidTransition(from, to, isAdminOverride)) return [from, to];

  const queue: OrderStatus[][] = [[from]];
  const seen = new Set<OrderStatus>([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const tail = path[path.length - 1];
    for (const next of VALID_TRANSITIONS[tail] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      queue.push(nextPath);
    }
  }

  return null;
}

/**
 * Check if a status is a terminal state.
 * @param status - Status to check
 * @returns true if terminal
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
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
  return role === "OWNER" || role === "ADMIN" || role === "STAFF_MANAGE_ORDERS";
}

/**
 * Check if user has admin override permission.
 * @param role - User's role
 * @returns true if has admin override
 */
export function hasAdminOverride(role?: string): boolean {
  return role === "OWNER";
}
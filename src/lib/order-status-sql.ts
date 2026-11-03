import "server-only";
import { inArray, notInArray, sql, type SQLWrapper } from "drizzle-orm";
import { orderStatusVariants } from "@/lib/order-state-machine";
import type { OrderStatus } from "@/lib/types";

/**
 * SQL-side order status predicates.
 *
 * Stored rows may still hold legacy spellings ("Pending", "Completed",
 * "Cancelled", "Preparing") until the `0019_normalize_order_status` migration
 * is applied — and new rows are written canonically. These helpers match BOTH
 * so filters/counts stay correct during and after the transition.
 *
 * Note: `upper(status)` cannot use a btree index on `status`; the predicate is
 * always combined with a `store_id` filter which uses `orders_store_id_idx`.
 */

/** `upper(status) = <canonical>` (+ every legacy variant of it). */
export function orderStatusIs(column: SQLWrapper, status: OrderStatus) {
  return inArray(sql`upper(${column})`, orderStatusVariants(status));
}

/** `upper(status) IN (<canonicals...>)` (+ every legacy variant). */
export function orderStatusIn(
  column: SQLWrapper,
  statuses: readonly OrderStatus[]
) {
  const variants = [
    ...new Set(statuses.flatMap((status) => orderStatusVariants(status))),
  ];
  return inArray(sql`upper(${column})`, variants);
}

/** `upper(status) NOT IN (<canonicals...>)` (+ every legacy variant). */
export function orderStatusNotIn(
  column: SQLWrapper,
  statuses: readonly OrderStatus[]
) {
  const variants = [
    ...new Set(statuses.flatMap((status) => orderStatusVariants(status))),
  ];
  return notInArray(sql`upper(${column})`, variants);
}

/**
 * Single source of truth for which orders count towards sales/revenue.
 *
 * Money metrics (Today's Sales, Total Revenue, AOV, coupon/customer revenue)
 * only count orders whose status is strictly "Completed" AND payment_status is
 * paid. Pending, Confirmed, Preparing, Ready, Shipped and Cancelled orders
 * never contribute revenue.
 *
 * `payment_status` matches are case-insensitive: writers store lowercase
 * (`paid`, see `orders_payment_status_check`) but metrics must keep working for
 * any casing already present in the database.
 *
 * Order *counts* are a separate concern: they may keep including every order
 * received (or every non-cancelled order) — only money goes through
 * `countsTowardRevenue`.
 */

export const REVENUE_ORDER_STATUS = "Completed";
export const REVENUE_PAYMENT_STATUS = "paid";

/** Predicate for aggregating already-fetched order rows (client or server). */
export function countsTowardRevenue(order: {
  status: string;
  paymentStatus?: string;
}): boolean {
  return (
    order.status === REVENUE_ORDER_STATUS &&
    (order.paymentStatus ?? "unpaid").toLowerCase() === REVENUE_PAYMENT_STATUS
  );
}

/** SQL WHERE clause fragment for revenue-eligible orders. */
export const revenueWhereClause = (ordersTable: {
  status: any;
  paymentStatus: any;
}) => `(${ordersTable.status} = '${REVENUE_ORDER_STATUS}' AND LOWER(${ordersTable.paymentStatus}) = '${REVENUE_PAYMENT_STATUS}')`;
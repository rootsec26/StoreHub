import { NextResponse } from "next/server";
import { eq, sql, and, gte, desc } from "drizzle-orm";

import { db } from "@/db";
import { orders, products, stores } from "@/db/schema";
import { resolveStoreAccess, getSession } from "@/lib/auth";
import { REVENUE_ORDER_STATUS, REVENUE_PAYMENT_STATUS } from "@/lib/order-metrics";
import { orderStatusIs } from "@/lib/order-status-sql";
import { createErrorResponse, formatErrorForLog } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Runs one dashboard aggregation on its own: a failing metric degrades to its
 * zero/empty fallback (and is logged) instead of failing the whole request
 * with a 500. `null` means "query failed" so callers can still fall back.
 */
async function safeStat<T>(
  label: string,
  run: () => Promise<T>
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(
      `[api/dashboard/stats] "${label}" aggregation failed, using fallback 0: ${formatErrorForLog(
        error,
        { includeStack: false }
      )}`
    );
    return null;
  }
}

/** Null-safe numeric coercion: `null`/`undefined`/NaN all collapse to 0. */
function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Dashboard stats: today's orders, today's sales (Completed + paid only),
 * total products, pending orders, recent orders.
 * All revenue calculations done in the database.
 */
export async function GET() {
  let userId: string | undefined;
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    userId = session.id;

    const storeAccess = await resolveStoreAccess(session.id);
    const userStore = storeAccess ? [{ id: storeAccess.store.id }] : [];

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const storeId = userStore[0].id;

    // Revenue condition: DELIVERED AND paid (case-insensitive payment match)
    const revenueCondition = and(
      orderStatusIs(orders.status, REVENUE_ORDER_STATUS),
      sql`LOWER(${orders.paymentStatus}) = ${REVENUE_PAYMENT_STATUS}`
    );

    // Today's start (UTC)
    const todayStart = sql`DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`;

    // Fetch all stats in parallel — each metric is isolated so one failing
    // aggregation can never take down the dashboard with a 500.
    const [
      todayStatsResult,
      pendingCountResult,
      productsCountResult,
      recentOrdersResult,
    ] = await Promise.all([
      // Today's orders and sales
      safeStat("todayOrders/todaySales", () =>
        db
          .select({
            todayOrders: sql<number>`COUNT(*)::int`,
            todaySales: sql<string | null>`COALESCE(SUM(${orders.totalAmount}) FILTER (WHERE ${revenueCondition}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.storeId, storeId),
              gte(orders.createdAt, todayStart)
            )
          )
      ),

      // Pending orders count
      safeStat("pendingOrders", () =>
        db
          .select({ count: sql<number | null>`COUNT(*)::int` })
          .from(orders)
          .where(
            and(
              eq(orders.storeId, storeId),
              orderStatusIs(orders.status, "PENDING")
            )
          )
      ),

      // Total products count
      safeStat("totalProducts", () =>
        db
          .select({ count: sql<number | null>`COUNT(*)::int` })
          .from(products)
          .where(eq(products.storeId, storeId))
      ),

      // Recent 5 orders
      safeStat("recentOrders", () =>
        db
          .select({
            id: orders.id,
            customerName: orders.customerName,
            totalAmount: orders.totalAmount,
            status: orders.status,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(eq(orders.storeId, storeId))
          .orderBy(desc(orders.createdAt))
          .limit(5)
      ),
    ]);

    const todayStats = todayStatsResult?.[0] ?? {
      todayOrders: 0,
      todaySales: "0",
    };
    const pendingCount = pendingCountResult?.[0]?.count;
    const totalProducts = productsCountResult?.[0]?.count;

    return NextResponse.json({
      todayOrders: toCount(todayStats.todayOrders),
      todaySales: String(todayStats.todaySales ?? "0"),
      pendingOrders: toCount(pendingCount),
      totalProducts: toCount(totalProducts),
      recentOrders: recentOrdersResult ?? [],
    });
  } catch (error) {
    console.error(
      `[api/dashboard/stats] request failed for user ${userId ?? "unknown"}: ${formatErrorForLog(
        error
      )}`
    );
    return createErrorResponse(error, "Failed to fetch dashboard stats");
  }
}
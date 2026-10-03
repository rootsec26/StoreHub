import { NextResponse } from "next/server";
import { eq, sql, and, gte, desc } from "drizzle-orm";

import { db } from "@/db";
import { orders, products, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { REVENUE_ORDER_STATUS, REVENUE_PAYMENT_STATUS } from "@/lib/order-metrics";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Dashboard stats: today's orders, today's sales (Completed + paid only),
 * total products, pending orders, recent orders.
 * All revenue calculations done in the database.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const userStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const storeId = userStore[0].id;

    // Revenue condition: Completed AND paid (case-insensitive payment match)
    const revenueCondition = and(
      eq(orders.status, REVENUE_ORDER_STATUS),
      sql`LOWER(${orders.paymentStatus}) = ${REVENUE_PAYMENT_STATUS}`
    );

    // Today's start (UTC)
    const todayStart = sql`DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`;

    // Fetch all stats in parallel
    const [
      todayStatsResult,
      pendingCountResult,
      productsCountResult,
      recentOrdersResult,
    ] = await Promise.all([
      // Today's orders and sales
      db
        .select({
          todayOrders: sql<number>`COUNT(*)::int`,
          todaySales: sql<string>`COALESCE(SUM(${orders.totalAmount}) FILTER (WHERE ${revenueCondition}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            gte(orders.createdAt, todayStart)
          )
        ),

      // Pending orders count
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), eq(orders.status, "Pending"))),

      // Total products count
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(products)
        .where(eq(products.storeId, storeId)),

      // Recent 5 orders
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
        .limit(5),
    ]);

    const todayStats = todayStatsResult[0] ?? { todayOrders: 0, todaySales: "0" };
    const pendingCount = pendingCountResult[0]?.count ?? 0;
    const totalProducts = productsCountResult[0]?.count ?? 0;

    return NextResponse.json({
      todayOrders: todayStats.todayOrders,
      todaySales: todayStats.todaySales,
      pendingOrders: pendingCount,
      totalProducts,
      recentOrders: recentOrdersResult,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    return createErrorResponse(error, "Failed to fetch dashboard stats");
  }
}
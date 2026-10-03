import { NextResponse } from "next/server";
import { asc, eq, sql, and, gte, desc } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders, products, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { REVENUE_ORDER_STATUS, REVENUE_PAYMENT_STATUS } from "@/lib/order-metrics";
import type {
  AnalyticsBucket,
  AnalyticsResponse,
  AnalyticsTopProduct,
} from "@/lib/types";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const DAILY_BUCKETS = 14;
const WEEKLY_BUCKETS = 8;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday-based start of the UTC week containing `date`. */
function weekStartKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return dayKey(d);
}

function round2(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toFixed(2);
}

/**
 * Revenue trends (daily/weekly), top 5 best-sellers and AOV for the store.
 * Money metrics only include orders with status "Completed" AND payment_status "paid".
 * Order counts include every order except the Cancelled ones.
 * All aggregations are performed in the database engine.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
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
    const today = new Date();
    const todayStart = dayKey(new Date(today.setHours(0, 0, 0, 0)));

    // Build date boundaries for daily and weekly buckets
    const dailyKeys: string[] = [];
    for (let i = DAILY_BUCKETS - 1; i >= 0; i--) {
      dailyKeys.push(dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
    }

    const weeklyKeys: string[] = [];
    {
      const start = new Date(weekStartKey(new Date()) + "T00:00:00.000Z");
      for (let i = WEEKLY_BUCKETS - 1; i >= 0; i--) {
        weeklyKeys.push(
          dayKey(new Date(start.getTime() - i * 7 * 24 * 60 * 60 * 1000))
        );
      }
    }

    // Revenue condition: Completed AND paid (case-insensitive payment match)
    const revenueCondition = and(
      eq(orders.status, REVENUE_ORDER_STATUS),
      sql`LOWER(${orders.paymentStatus}) = ${REVENUE_PAYMENT_STATUS}`
    );

    // Valid orders for counting (not cancelled)
    const validOrderCondition = sql`${orders.status} != 'Cancelled'`;

    // --- Summary: Total orders, total revenue, completed orders, AOV ---
    const summaryResult = await db
      .select({
        totalOrders: sql<number>`COUNT(*) FILTER (WHERE ${validOrderCondition})::int`,
        completedOrders: sql<number>`COUNT(*) FILTER (WHERE ${revenueCondition})::int`,
        totalRevenue: sql<string>`COALESCE(SUM(${orders.totalAmount}) FILTER (WHERE ${revenueCondition}), 0)`,
      })
      .from(orders)
      .where(eq(orders.storeId, storeId));

    const summary = summaryResult[0] ?? {
      totalOrders: 0,
      completedOrders: 0,
      totalRevenue: "0",
    };

    // --- Daily buckets ---
    const dailyBuckets = await db
      .select({
        key: sql<string>`TO_CHAR(${orders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}) FILTER (WHERE ${revenueCondition}), 0)`,
        orders: sql<number>`COUNT(*) FILTER (WHERE ${validOrderCondition})::int`,
        completedOrders: sql<number>`COUNT(*) FILTER (WHERE ${revenueCondition})::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          gte(orders.createdAt, sql`(CURRENT_DATE - INTERVAL '${DAILY_BUCKETS - 1} days')`)
        )
      )
      .groupBy(sql`TO_CHAR(${orders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

    const dailyMap = new Map<string, AnalyticsBucket>();
    for (const bucket of dailyBuckets) {
      dailyMap.set(bucket.key, {
        key: bucket.key,
        label: bucket.key,
        revenue: round2(bucket.revenue),
        orders: bucket.orders,
        completedOrders: bucket.completedOrders,
      });
    }

    const daily: AnalyticsBucket[] = dailyKeys.map((key) =>
      dailyMap.get(key) ?? { key, label: key, revenue: "0.00", orders: 0, completedOrders: 0 }
    );

    // --- Weekly buckets ---
    const weeklyBuckets = await db
      .select({
        key: sql<string>`TO_CHAR(DATE_TRUNC('week', ${orders.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}) FILTER (WHERE ${revenueCondition}), 0)`,
        orders: sql<number>`COUNT(*) FILTER (WHERE ${validOrderCondition})::int`,
        completedOrders: sql<number>`COUNT(*) FILTER (WHERE ${revenueCondition})::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          gte(
            orders.createdAt,
            sql`(DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '${WEEKLY_BUCKETS - 1} weeks')`
          )
        )
      )
      .groupBy(sql`DATE_TRUNC('week', ${orders.createdAt} AT TIME ZONE 'UTC')`);

    const weeklyMap = new Map<string, AnalyticsBucket>();
    for (const bucket of weeklyBuckets) {
      weeklyMap.set(bucket.key, {
        key: bucket.key,
        label: bucket.key,
        revenue: round2(bucket.revenue),
        orders: bucket.orders,
        completedOrders: bucket.completedOrders,
      });
    }

    const weekly: AnalyticsBucket[] = weeklyKeys.map((key) =>
      weeklyMap.get(key) ?? { key, label: key, revenue: "0.00", orders: 0, completedOrders: 0 }
    );

    // --- Top 5 products ---
    // Quantity: all non-cancelled orders
    // Revenue: only Completed + Paid orders
    const topProductsResult = await db
      .select({
        productId: orderItems.productId,
        name: products.name,
        imageUrl: products.imageUrl,
        quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}) FILTER (WHERE ${validOrderCondition}), 0)::int`,
        revenue: sql<string>`COALESCE(SUM(${orderItems.unitPrice} * ${orderItems.quantity}) FILTER (WHERE ${revenueCondition}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.storeId, storeId))
      .groupBy(orderItems.productId, products.name, products.imageUrl)
      .orderBy(desc(sql`quantity`), desc(sql`revenue`))
      .limit(5);

    const topProducts: AnalyticsTopProduct[] = topProductsResult.map((p) => ({
      productId: p.productId,
      name: p.name,
      imageUrl: p.imageUrl ?? "",
      quantity: p.quantity,
      revenue: round2(p.revenue),
    }));

    const payload: AnalyticsResponse = {
      summary: {
        totalOrders: summary.totalOrders,
        totalRevenue: round2(summary.totalRevenue),
        avgOrderValue: round2(
          summary.completedOrders > 0
            ? (parseFloat(summary.totalRevenue) / summary.completedOrders).toString()
            : "0"
        ),
      },
      daily,
      weekly,
      topProducts,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Get analytics error:", error);
    return createErrorResponse(error, "Failed to fetch analytics");
  }
}
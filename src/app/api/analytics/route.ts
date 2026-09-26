import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders, products, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import type {
  AnalyticsBucket,
  AnalyticsResponse,
  AnalyticsTopProduct,
} from "@/lib/types";

export const runtime = "nodejs";

const DAILY_BUCKETS = 14;
const WEEKLY_BUCKETS = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function round2(value: number): string {
  return value.toFixed(2);
}

/**
 * Revenue trends (daily/weekly), top 5 best-sellers and AOV for the store.
 * Cancelled orders are excluded from every metric.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const storeId = userStore[0].id;

    const [orderRows, itemRows] = await Promise.all([
      db
        .select({
          id: orders.id,
          totalAmount: orders.totalAmount,
          status: orders.status,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.storeId, storeId)),
      db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          name: products.name,
          imageUrl: products.imageUrl,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(products.storeId, storeId))
        .orderBy(asc(orderItems.orderId)),
    ]);

    const validOrderIds = new Set(
      orderRows.filter((o) => o.status !== "Cancelled").map((o) => o.id)
    );

    const today = new Date();

    const dailyKeys: string[] = [];
    for (let i = DAILY_BUCKETS - 1; i >= 0; i--) {
      dailyKeys.push(dayKey(new Date(today.getTime() - i * MS_PER_DAY)));
    }

    const weeklyKeys: string[] = [];
    {
      const start = new Date(weekStartKey(today) + "T00:00:00.000Z");
      for (let i = WEEKLY_BUCKETS - 1; i >= 0; i--) {
        weeklyKeys.push(
          dayKey(new Date(start.getTime() - i * 7 * MS_PER_DAY))
        );
      }
    }

    const dailyMap = new Map<string, { revenue: number; orders: number }>(
      dailyKeys.map((key) => [key, { revenue: 0, orders: 0 }])
    );
    const weeklyMap = new Map<string, { revenue: number; orders: number }>(
      weeklyKeys.map((key) => [key, { revenue: 0, orders: 0 }])
    );

    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of orderRows) {
      if (!validOrderIds.has(order.id)) continue;
      const revenue = parseFloat(order.totalAmount) || 0;
      const key = dayKey(new Date(order.createdAt));
      const weekKey = weekStartKey(new Date(order.createdAt));

      totalRevenue += revenue;
      totalOrders += 1;

      const daily = dailyMap.get(key);
      if (daily) {
        daily.revenue += revenue;
        daily.orders += 1;
      }
      const weekly = weeklyMap.get(weekKey);
      if (weekly) {
        weekly.revenue += revenue;
        weekly.orders += 1;
      }
    }

    const toBucket = (key: string, value: { revenue: number; orders: number }): AnalyticsBucket => ({
      key,
      label: key,
      revenue: round2(value.revenue),
      orders: value.orders,
    });

    const daily: AnalyticsBucket[] = dailyKeys.map((key) =>
      toBucket(key, dailyMap.get(key) ?? { revenue: 0, orders: 0 })
    );
    const weekly: AnalyticsBucket[] = weeklyKeys.map((key) =>
      toBucket(key, weeklyMap.get(key) ?? { revenue: 0, orders: 0 })
    );

    // Top 5 best-selling products (quantity sold, revenue excluded from cancelled orders)
    const productTotals = new Map<
      string,
      { name: string; imageUrl: string; quantity: number; revenue: number }
    >();

    for (const item of itemRows) {
      if (!validOrderIds.has(item.orderId)) continue;
      const existing = productTotals.get(item.productId) ?? {
        name: item.name,
        imageUrl: item.imageUrl ?? "",
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += (parseFloat(item.unitPrice) || 0) * item.quantity;
      productTotals.set(item.productId, existing);
    }

    const topProducts: AnalyticsTopProduct[] = [...productTotals.entries()]
      .map(([productId, value]) => ({
        productId,
        name: value.name,
        imageUrl: value.imageUrl,
        quantity: value.quantity,
        revenue: round2(value.revenue),
      }))
      .sort(
        (a, b) =>
          b.quantity - a.quantity || parseFloat(b.revenue) - parseFloat(a.revenue)
      )
      .slice(0, 5);

    const payload: AnalyticsResponse = {
      summary: {
        totalOrders,
        totalRevenue: round2(totalRevenue),
        avgOrderValue: round2(totalOrders > 0 ? totalRevenue / totalOrders : 0),
      },
      daily,
      weekly,
      topProducts,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Get analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

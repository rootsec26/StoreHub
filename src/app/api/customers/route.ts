import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import type {
  CustomerSummary,
  CustomersResponse,
  CustomersSummaryStats,
} from "@/lib/types";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Customers aggregated from the `orders` table, grouped by `customer_phone`.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const grouped = await db
      .select({
        phone: orders.customerPhone,
        name: sql<string>`max(${orders.customerName})`.as("name"),
        totalOrders: sql<number>`count(*)::int`.as("total_orders"),
        totalSpent: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`.as(
          "total_spent"
        ),
        lastOrderAt: sql<string>`max(${orders.createdAt})::text`.as(
          "last_order_at"
        ),
      })
      .from(orders)
      .where(eq(orders.storeId, userStore[0].id))
      .groupBy(orders.customerPhone)
      .orderBy(desc(sql`max(${orders.createdAt})`));

    const customers: CustomerSummary[] = grouped.map((row) => ({
      phone: row.phone ?? "",
      name: row.name || "—",
      totalOrders: Number(row.totalOrders) || 0,
      totalSpent: String(row.totalSpent ?? "0"),
      lastOrderAt: row.lastOrderAt ?? "",
    }));

    const totalOrders = customers.reduce((sum, c) => sum + c.totalOrders, 0);
    const totalRevenue = customers.reduce(
      (sum, c) => sum + (parseFloat(c.totalSpent) || 0),
      0
    );

    const summary: CustomersSummaryStats = {
      totalCustomers: customers.length,
      totalRevenue: totalRevenue.toFixed(2),
      repeatCustomers: customers.filter((c) => c.totalOrders > 1).length,
      avgOrderValue:
        totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : "0.00",
    };

    const payload: CustomersResponse = { customers, summary };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Get customers error:", error);
    return createErrorResponse(error, "Failed to fetch customers");
  }
}

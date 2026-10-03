import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coupons, orders, stores } from "@/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { REVENUE_ORDER_STATUS } from "@/lib/order-metrics";
import { createErrorResponse } from "@/lib/errors";
import { couponStatus, type CouponRecord } from "@/lib/promotions";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function toRecord(row: typeof coupons.$inferSelect): CouponRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    code: row.code,
    discountAmount: String(row.discountAmount),
    minSpend: String(row.minSpend),
    maxUses: row.maxUses,
    timesUsed: row.timesUsed,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

// Get coupons + campaign performance stats for the owner's store
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const rows = await db
      .select()
      .from(coupons)
      .where(eq(coupons.storeId, store.id))
      .orderBy(desc(coupons.createdAt));

    const records = rows.map(toRecord);
    const now = Date.now();

    const [revenueRow, redemptionRow] = await Promise.all([
      db
        .select({
          // Money metric: only Completed orders count towards coupon revenue.
          total: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, store.id),
            isNotNull(orders.couponCode),
            eq(orders.status, REVENUE_ORDER_STATUS)
          )
        ),
      db
        .select({ count: sql<string>`count(*)` })
        .from(orders)
        .where(
          and(eq(orders.storeId, store.id), isNotNull(orders.couponCode))
        ),
    ]);

    const topCodes = [...records]
      .sort((a, b) => b.timesUsed - a.timesUsed)
      .filter((coupon) => coupon.timesUsed > 0)
      .slice(0, 3)
      .map((coupon) => ({ code: coupon.code, timesUsed: coupon.timesUsed }));

    return NextResponse.json({
      coupons: records,
      stats: {
        revenue: String(revenueRow[0]?.total ?? "0"),
        redemptions: Number(redemptionRow[0]?.count ?? 0),
        activeCount: records.filter(
          (coupon) => couponStatus(coupon, now) === "active"
        ).length,
        topCodes,
      },
    });
  } catch (error) {
    console.error("Get coupons error:", error);
    return createErrorResponse(error, "Failed to fetch coupons");
  }
}

// Create a coupon code
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { code, discountAmount, minSpend, maxUses, expiresAt } = body ?? {};

    const normalizedCode = String(code ?? "")
      .trim()
      .toUpperCase();
    const discount = Number(discountAmount);
    const minimum = Number(minSpend ?? 0);
    const limit = Number(maxUses ?? 1);
    const expiry = expiresAt ? new Date(expiresAt) : null;

    if (!normalizedCode) {
      return NextResponse.json(
        { error: "Coupon code is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(discount) || discount <= 0) {
      return NextResponse.json(
        { error: "Discount amount must be greater than 0", code: "INVALID_DISCOUNT" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(minimum) || minimum < 0) {
      return NextResponse.json(
        { error: "Minimum spend cannot be negative", code: "INVALID_MIN_SPEND" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(limit) || limit < 1) {
      return NextResponse.json(
        { error: "Usage limit must be at least 1", code: "INVALID_MAX_USES" },
        { status: 400 }
      );
    }
    if (expiry && Number.isNaN(expiry.getTime())) {
      return NextResponse.json(
        { error: "Invalid expiry date", code: "INVALID_EXPIRY" },
        { status: 400 }
      );
    }

    const result = await db
      .insert(coupons)
      .values({
        storeId: store.id,
        code: normalizedCode,
        discountAmount: discount.toFixed(2),
        minSpend: minimum.toFixed(2),
        maxUses: Math.round(limit),
        expiresAt: expiry,
      })
      .returning();

    return NextResponse.json({ coupon: toRecord(result[0]) });
  } catch (error) {
    console.error("Create coupon error:", error);
    return createErrorResponse(error, "Failed to create coupon");
  }
}

// Delete a coupon
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Coupon ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const result = await db
      .delete(coupons)
      .where(and(eq(coupons.id, id), eq(coupons.storeId, store.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Coupon not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return createErrorResponse(error, "Failed to delete coupon");
  }
}

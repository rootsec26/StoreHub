import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeReviews } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";
import { createErrorResponse } from "@/lib/errors";

/**
 * GET /api/reviews — the merchant's own store reviews.
 * Returns the newest reviews plus aggregate stats (average, count,
 * per-star distribution) for the dashboard Reviews page.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await getAccessibleStores(session.id);
    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const store = {
      ...userStore[0],
      themeConfig: userStore[0].themeConfig || DEFAULT_THEME_CONFIG,
    };

    const [reviews, aggregate, distribution] = await Promise.all([
      db
        .select({
          id: storeReviews.id,
          customerName: storeReviews.customerName,
          rating: storeReviews.rating,
          comment: storeReviews.comment,
          createdAt: storeReviews.createdAt,
        })
        .from(storeReviews)
        .where(eq(storeReviews.storeId, store.id))
        .orderBy(desc(storeReviews.createdAt))
        .limit(200),
      db
        .select({
          count: sql<number>`count(*)::int`,
          average: sql<number>`coalesce(avg(${storeReviews.rating}), 0)::float`,
        })
        .from(storeReviews)
        .where(eq(storeReviews.storeId, store.id)),
      db
        .select({
          rating: storeReviews.rating,
          count: sql<number>`count(*)::int`,
        })
        .from(storeReviews)
        .where(eq(storeReviews.storeId, store.id))
        .groupBy(storeReviews.rating),
    ]);

    const stats = aggregate[0] ?? { count: 0, average: 0 };
    const perStar: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) {
      perStar[row.rating] = row.count;
    }

    return NextResponse.json({
      reviews: reviews.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      average: Math.round(stats.average * 10) / 10,
      count: stats.count,
      perStar,
      storeSlug: store.slug,
    });
  } catch (error) {
    console.error("Merchant reviews fetch error:", error);
    return createErrorResponse(error, "Failed to load reviews");
  }
}

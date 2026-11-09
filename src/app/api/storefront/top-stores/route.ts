import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeReviews, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_STORES = 12;

/**
 * GET /api/storefront/top-stores
 * Public: the highest-rated storefronts on the platform, ranked by average
 * review score (then review volume). Powers the landing-page showcase.
 */
export async function GET() {
  try {
    const rows = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        logoUrl: stores.logoUrl,
        accentColor: stores.accentColor,
        average: sql<number>`avg(${storeReviews.rating})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(storeReviews)
      .innerJoin(stores, eq(stores.id, storeReviews.storeId))
      .groupBy(stores.id)
      .orderBy(
        desc(sql`avg(${storeReviews.rating})`),
        desc(sql`count(*)`)
      )
      .limit(MAX_STORES);

    return NextResponse.json({
      stores: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logoUrl ?? "",
        accentColor: row.accentColor ?? "",
        average: Math.round(row.average * 10) / 10,
        count: row.count,
      })),
    });
  } catch (error) {
    console.error("Top stores fetch error:", error);
    return createErrorResponse(error, "Failed to load top stores");
  }
}

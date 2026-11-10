import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeFollowers, storeReviews, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_STORES = 12;
const POOL_SIZE = 12;
/** A store wears the gold crown when it ranks in the top N of BOTH lists. */
const CROWN_RANK = 5;
/** Eligibility gate: verified badge + at least this many total followers. */
const MIN_FOLLOWERS = 10_000;

/**
 * GET /api/storefront/top-stores
 * Public: merged ranking of the platform's best storefronts.
 *
 * Eligibility (applied to BOTH pools): the store must be verified
 * (is_verified = true) and have at least MIN_FOLLOWERS total followers
 * (real store_followers rows plus the verification milestone boost).
 * Unverified or low-follower stores never appear in this section.
 *
 * Two pools are computed and merged:
 *   a) TOP-RATED  — every review is 5/5 (avg = 5.0), ranked by review count
 *      then followers. A single sub-5 review disqualifies a store here.
 *   b) TOP-FOLLOWED — every store ranked by total followers (real
 *      store_followers rows plus the verification milestone boost).
 *
 * The merged list is ordered by each store's combined rank (Borda-style:
 * rating-pool position + follower-pool position), so stores that excel in
 * BOTH categories surface first. `goldCrown` is true when a store sits in
 * the top CROWN_RANK of both pools.
 */
export async function GET() {
  try {
    const followerCount = sql<number>`(select count(*)::int from ${storeFollowers} where ${storeFollowers.storeId} = ${stores.id}) + ${stores.followerBoost}`;

    // Pool A — perfect-rated stores only.
    const ratedRows = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        logoUrl: stores.logoUrl,
        accentColor: stores.accentColor,
        isVerified: stores.isVerified,
        average: sql<number>`avg(${storeReviews.rating})::float`,
        count: sql<number>`count(*)::int`,
        followers: followerCount,
      })
      .from(storeReviews)
      .innerJoin(stores, eq(stores.id, storeReviews.storeId))
      .where(and(eq(stores.isVerified, true), sql`${followerCount} >= ${MIN_FOLLOWERS}`))
      .groupBy(stores.id)
      // Strict gate: min(rating) = 5 means EVERY review is 5/5 — a single
      // 1-4 star rating disqualifies the store entirely.
      .having(sql`min(${storeReviews.rating}) = 5`)
      .orderBy(desc(sql`count(*)`), desc(followerCount))
      .limit(POOL_SIZE);

    // Pool B — every store by total followers, review stats included when
    // they exist so unrated stores can still appear on the cards.
    const followedRows = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        logoUrl: stores.logoUrl,
        accentColor: stores.accentColor,
        isVerified: stores.isVerified,
        average: sql<number | null>`avg(${storeReviews.rating})::float`,
        count: sql<number>`count(${storeReviews.id})::int`,
        followers: followerCount,
      })
      .from(stores)
      .leftJoin(storeReviews, eq(storeReviews.storeId, stores.id))
      .where(and(eq(stores.isVerified, true), sql`${followerCount} >= ${MIN_FOLLOWERS}`))
      .groupBy(stores.id)
      .orderBy(desc(followerCount), desc(sql`count(${storeReviews.id})`))
      .limit(POOL_SIZE);

    type Row = (typeof followedRows)[number];
    const ratingRank = new Map<string, number>();
    const followerRank = new Map<string, number>();
    ratedRows.forEach((row, i) => ratingRank.set(row.id, i));
    followedRows.forEach((row, i) => followerRank.set(row.id, i));

    const merged = new Map<string, Row>();
    for (const row of [...ratedRows, ...followedRows]) {
      if (!merged.has(row.id)) merged.set(row.id, row);
    }

    const ranked = [...merged.values()]
      .map((row) => ({
        row,
        // Absent from a pool = ranked just below its tail.
        score:
          (ratingRank.get(row.id) ?? POOL_SIZE) +
          (followerRank.get(row.id) ?? POOL_SIZE),
        goldCrown:
          (ratingRank.get(row.id) ?? POOL_SIZE) < CROWN_RANK &&
          (followerRank.get(row.id) ?? POOL_SIZE) < CROWN_RANK,
      }))
      .sort(
        (a, b) =>
          a.score - b.score ||
          b.row.followers - a.row.followers ||
          (b.row.average ?? 0) - (a.row.average ?? 0)
      )
      .slice(0, MAX_STORES);

    return NextResponse.json({
      stores: ranked.map(({ row, goldCrown }) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logoUrl ?? "",
        accentColor: row.accentColor ?? "",
        isVerified: row.isVerified,
        average: row.average == null ? null : Math.round(row.average * 10) / 10,
        count: row.count,
        followers: row.followers,
        goldCrown,
      })),
    });
  } catch (error) {
    console.error("Top stores fetch error:", error);
    return createErrorResponse(error, "Failed to load top stores");
  }
}

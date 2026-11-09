import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeReviews, stores } from "@/db/schema";
import { isValidUuid } from "@/lib/storefront";
import {
  denyAdmin,
  errorResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/reviews — every shopper review across all stores.
 * Query: page, limit, storeId, rating (1-5), q (name/comment search).
 * Also returns the store list used by the filter dropdown.
 */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25) || 25));
    const storeId = params.get("storeId") ?? undefined;
    const ratingParam = params.get("rating");
    const rating =
      ratingParam && /^[1-5]$/.test(ratingParam) ? Number(ratingParam) : undefined;
    const q = params.get("q")?.trim() || undefined;

    if (storeId && !isValidUuid(storeId)) {
      return NextResponse.json(
        { error: "Invalid storeId", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const conditions = [];
    if (storeId) conditions.push(eq(storeReviews.storeId, storeId));
    if (rating) conditions.push(eq(storeReviews.rating, rating));
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(storeReviews.customerName, pattern),
          ilike(storeReviews.comment, pattern),
          ilike(stores.name, pattern)
        )
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows, storeOptions] = await Promise.all([
      db
        .select({
          id: storeReviews.id,
          storeId: storeReviews.storeId,
          storeName: stores.name,
          storeSlug: stores.slug,
          customerName: storeReviews.customerName,
          rating: storeReviews.rating,
          comment: storeReviews.comment,
          createdAt: storeReviews.createdAt,
        })
        .from(storeReviews)
        .innerJoin(stores, eq(stores.id, storeReviews.storeId))
        .where(where)
        .orderBy(desc(storeReviews.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeReviews)
        .innerJoin(stores, eq(stores.id, storeReviews.storeId))
        .where(where),
      db
        .select({ id: stores.id, name: stores.name })
        .from(stores)
        .orderBy(stores.name)
        .limit(500),
    ]);

    return NextResponse.json({
      reviews: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      total: totalRows[0]?.count ?? 0,
      page,
      pageSize: limit,
      stores: storeOptions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { storeReviews, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { getSessionWithStore } from "@/lib/auth";
import { getStoreBySlug, isValidUuid } from "@/lib/storefront";
import { storefrontReviewRateLimiter, withRateLimit } from "@/lib/rate-limit";

const MAX_REVIEWS_RETURNED = 100;
const MAX_NAME_LENGTH = 120;
const MAX_COMMENT_LENGTH = 2000;

interface ReviewRow {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

function serializeReview(row: ReviewRow) {
  return {
    id: row.id,
    customerName: row.customerName,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveStoreId(params: {
  storeId?: string;
  storeSlug?: string;
}): Promise<{ id: string; slug: string } | null> {
  if (params.storeSlug) {
    const store = await getStoreBySlug(params.storeSlug);
    return store ? { id: store.id, slug: store.slug } : null;
  }
  if (params.storeId && isValidUuid(params.storeId)) {
    const rows = await db
      .select({ id: stores.id, slug: stores.slug })
      .from(stores)
      .where(eq(stores.id, params.storeId))
      .limit(1);
    return rows[0] ?? null;
  }
  return null;
}

/**
 * GET /api/storefront/reviews?storeSlug=...|storeId=...
 * Public: latest reviews + aggregate rating for one store.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const store = await resolveStoreId({
      storeId: params.get("storeId") ?? undefined,
      storeSlug: params.get("storeSlug") ?? undefined,
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const [rows, aggregate] = await Promise.all([
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
        .limit(MAX_REVIEWS_RETURNED),
      db
        .select({
          count: sql<number>`count(*)::int`,
          average: sql<number>`coalesce(avg(${storeReviews.rating}), 0)::float`,
        })
        .from(storeReviews)
        .where(eq(storeReviews.storeId, store.id)),
    ]);

    const stats = aggregate[0] ?? { count: 0, average: 0 };
    return NextResponse.json({
      reviews: rows.map(serializeReview),
      average: Math.round(stats.average * 10) / 10,
      count: stats.count,
    });
  } catch (error) {
    console.error("Storefront reviews fetch error:", error);
    return createErrorResponse(error, "Failed to load reviews");
  }
}

/**
 * POST /api/storefront/reviews
 * Public: a shopper submits a 1-5 star review for a store.
 * Body: { storeSlug | storeId, customerName, rating, comment? }
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontReviewRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const store = await resolveStoreId({
      storeId: typeof body.storeId === "string" ? body.storeId : undefined,
      storeSlug: typeof body.storeSlug === "string" ? body.storeSlug : undefined,
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    // A merchant must never review their own storefront — the UI hides the
    // form, and this guard stops a crafted request from doing it anyway.
    const session = await getSessionWithStore();
    if (session?.storeId && session.storeId === store.id) {
      return NextResponse.json(
        {
          error: "You cannot review your own store",
          code: "OWN_STORE_REVIEW",
        },
        { status: 403 }
      );
    }

    const customerName =
      typeof body.customerName === "string"
        ? body.customerName.trim().slice(0, MAX_NAME_LENGTH)
        : "";
    if (!customerName) {
      return NextResponse.json(
        { error: "Your name is required", code: "MISSING_NAME" },
        { status: 400 }
      );
    }

    const rating = Math.floor(Number(body.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5", code: "INVALID_RATING" },
        { status: 400 }
      );
    }

    const comment =
      typeof body.comment === "string"
        ? body.comment.trim().slice(0, MAX_COMMENT_LENGTH)
        : "";

    const [review] = await db
      .insert(storeReviews)
      .values({
        storeId: store.id,
        customerName,
        rating,
        comment,
      })
      .returning({
        id: storeReviews.id,
        customerName: storeReviews.customerName,
        rating: storeReviews.rating,
        comment: storeReviews.comment,
        createdAt: storeReviews.createdAt,
      });

    // The storefront review section is part of the cached store layout.
    revalidatePath(`/store/${store.slug}`, "layout");

    return NextResponse.json(
      { success: true, review: serializeReview(review) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Storefront review submit error:", error);
    return createErrorResponse(error, "Failed to submit review");
  }
}

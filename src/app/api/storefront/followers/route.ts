import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeFollowers, stores } from "@/db/schema";
import { getSessionWithStore } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { getStoreBySlug, isValidUuid } from "@/lib/storefront";
import { storefrontFollowRateLimiter, withRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_FOLLOWER_ID_LENGTH = 64;
// Client-generated anonymous ids (crypto.randomUUID) and app user ids are
// uuids; allow the same loose charset for forward compatibility.
const FOLLOWER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

interface StoreRef {
  id: string;
  slug: string;
  followerBoost: number;
}

async function resolveStore(params: {
  storeId?: string;
  storeSlug?: string;
}): Promise<StoreRef | null> {
  if (params.storeSlug) {
    const store = await getStoreBySlug(params.storeSlug);
    return store
      ? {
          id: store.id,
          slug: store.slug,
          followerBoost: store.followerBoost ?? 0,
        }
      : null;
  }
  if (params.storeId && isValidUuid(params.storeId)) {
    const rows = await db
      .select({
        id: stores.id,
        slug: stores.slug,
        followerBoost: stores.followerBoost,
      })
      .from(stores)
      .where(eq(stores.id, params.storeId))
      .limit(1);
    const row = rows[0];
    return row
      ? { id: row.id, slug: row.slug, followerBoost: row.followerBoost ?? 0 }
      : null;
  }
  return null;
}

function isValidFollowerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FOLLOWER_ID_PATTERN.test(value) &&
    value.length <= MAX_FOLLOWER_ID_LENGTH
  );
}

async function followerCount(store: StoreRef): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storeFollowers)
    .where(eq(storeFollowers.storeId, store.id));
  // Real followers + the verification milestone boost (10k on approval).
  return (rows[0]?.count ?? 0) + Math.max(0, store.followerBoost ?? 0);
}

async function isFollowing(storeId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: storeFollowers.id })
    .from(storeFollowers)
    .where(
      and(
        eq(storeFollowers.storeId, storeId),
        eq(storeFollowers.userId, userId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Resolve who is following: a signed-in app user always wins (their session
 * id is authoritative); anonymous shoppers are identified by a
 * client-generated id persisted in localStorage.
 */
async function resolveFollowerId(
  provided: unknown
): Promise<{ followerId: string | null; sessionStoreId?: string }> {
  const session = await getSessionWithStore();
  if (session?.id) {
    return { followerId: session.id, sessionStoreId: session.storeId };
  }
  return {
    followerId: isValidFollowerId(provided) ? provided : null,
    sessionStoreId: session?.storeId,
  };
}

/**
 * GET /api/storefront/followers?slug=...&followerId=...
 * Public: follower count for a store, plus `following` when the caller's
 * follower id is supplied (or they are signed in).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const store = await resolveStore({
      storeId: params.get("storeId") ?? undefined,
      storeSlug:
        params.get("storeSlug") ?? params.get("slug") ?? undefined,
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { followerId } = await resolveFollowerId(
      params.get("followerId")
    );
    const [count, following] = await Promise.all([
      followerCount(store),
      followerId ? isFollowing(store.id, followerId) : Promise.resolve(false),
    ]);

    return NextResponse.json({ count, following });
  } catch (error) {
    console.error("Storefront followers fetch error:", error);
    return createErrorResponse(error, "Failed to load followers");
  }
}

/**
 * POST /api/storefront/followers
 * Public: follow a store. Body: { storeSlug | storeId, followerId? }
 * Idempotent — following twice keeps a single row.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontFollowRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const store = await resolveStore({
      storeId: typeof body.storeId === "string" ? body.storeId : undefined,
      storeSlug:
        typeof body.storeSlug === "string"
          ? body.storeSlug
          : typeof body.slug === "string"
            ? body.slug
            : undefined,
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { followerId, sessionStoreId } = await resolveFollowerId(
      body.followerId
    );
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    // Merchants must not follow their own storefront.
    if (sessionStoreId && sessionStoreId === store.id) {
      return NextResponse.json(
        {
          error: "You cannot follow your own store",
          code: "OWN_STORE_FOLLOW",
        },
        { status: 403 }
      );
    }

    const existing = await isFollowing(store.id, followerId);
    if (!existing) {
      try {
        await db.insert(storeFollowers).values({
          storeId: store.id,
          userId: followerId,
        });
      } catch (error) {
        // Unique-violation race: another request already created the row.
        const code = (error as { code?: string }).code;
        if (code !== "23505") throw error;
      }
    }

    const count = await followerCount(store);
    return NextResponse.json({ success: true, count, following: true });
  } catch (error) {
    console.error("Storefront follow error:", error);
    return createErrorResponse(error, "Failed to follow store");
  }
}

/**
 * DELETE /api/storefront/followers
 * Public: unfollow a store. Body: { storeSlug | storeId, followerId? }
 */
export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontFollowRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const store = await resolveStore({
      storeId: typeof body.storeId === "string" ? body.storeId : undefined,
      storeSlug:
        typeof body.storeSlug === "string"
          ? body.storeSlug
          : typeof body.slug === "string"
            ? body.slug
            : undefined,
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { followerId } = await resolveFollowerId(body.followerId);
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    await db
      .delete(storeFollowers)
      .where(
        and(
          eq(storeFollowers.storeId, store.id),
          eq(storeFollowers.userId, followerId)
        )
      );

    const count = await followerCount(store);
    return NextResponse.json({ success: true, count, following: false });
  } catch (error) {
    console.error("Storefront unfollow error:", error);
    return createErrorResponse(error, "Failed to unfollow store");
  }
}


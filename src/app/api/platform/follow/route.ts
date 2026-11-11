import { NextRequest, NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { platformFollows } from "@/db/schema";
import { getSession, isAppUserId } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { storefrontFollowRateLimiter, withRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FOLLOWER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function isValidFollowerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FOLLOWER_ID_PATTERN.test(value) &&
    value.length <= 64
  );
}

/** Signed-in users are identified by session; visitors by localStorage id. */
async function resolveFollowerId(
  provided: unknown
): Promise<{ followerId: string | null; providedId: string | null }> {
  const providedId = isValidFollowerId(provided) ? provided : null;
  const session = await getSession();
  if (session?.id) {
    return { followerId: session.id, providedId };
  }
  return { followerId: providedId, providedId };
}

/**
 * Ids whose platform-follow rows may be touched: the resolved follower id
 * plus the client-provided id — but only when it is NOT a real app user
 * (anonymous ids merge safely; another account's rows are never touched).
 */
async function manageableFollowerIds(
  followerId: string | null,
  providedId: string | null
): Promise<string[]> {
  const ids = new Set<string>();
  if (followerId) ids.add(followerId);
  if (providedId && providedId !== followerId) {
    if (!(await isAppUserId(providedId))) ids.add(providedId);
  }
  return [...ids];
}

async function isFollowingAny(followerIds: string[]): Promise<boolean> {
  if (followerIds.length === 0) return false;
  const rows = await db
    .select({ id: platformFollows.id })
    .from(platformFollows)
    .where(inArray(platformFollows.followerId, followerIds))
    .limit(1);
  return rows.length > 0;
}

async function followerCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformFollows);
  return rows[0]?.count ?? 0;
}

/**
 * GET /api/platform/follow?followerId=...
 * Public: follower count for the platform feed plus `following` for the caller.
 */
export async function GET(request: NextRequest) {
  try {
    const { followerId, providedId } = await resolveFollowerId(
      request.nextUrl.searchParams.get("followerId")
    );
    // A shopper who followed anonymously and then signed in still counts as
    // following — check both the session id and their anonymous id.
    const checkIds = await manageableFollowerIds(followerId, providedId);

    const [count, following] = await Promise.all([
      followerCount(),
      isFollowingAny(checkIds),
    ]);

    return NextResponse.json({
      count,
      following,
    });
  } catch (error) {
    console.error("[api/platform/follow] GET failed:", error);
    return createErrorResponse(error, "Failed to load follow status");
  }
}

/**
 * POST /api/platform/follow — follow the platform feed.
 * Body: { followerId? } — idempotent.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontFollowRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json().catch(() => ({}))) as {
      followerId?: unknown;
    };
    const { followerId, providedId } = await resolveFollowerId(
      body.followerId
    );
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    const alreadyFollowing = await isFollowingAny([followerId]);

    if (!alreadyFollowing) {
      try {
        await db.insert(platformFollows).values({ followerId });
      } catch (error) {
        // Unique-violation race: another request already created the row.
        if ((error as { code?: string }).code !== "23505") throw error;
      }
    }

    // Merge an anonymous follow into the signed-in account so the user ends
    // up with exactly one active follow row for the platform feed.
    const mergeIds = await manageableFollowerIds(followerId, providedId);
    const anonIds = mergeIds.filter((id) => id !== followerId);
    if (anonIds.length > 0) {
      await db
        .delete(platformFollows)
        .where(inArray(platformFollows.followerId, anonIds));
    }

    return NextResponse.json({
      success: true,
      count: await followerCount(),
      following: true,
    });
  } catch (error) {
    console.error("[api/platform/follow] POST failed:", error);
    return createErrorResponse(error, "Failed to follow");
  }
}

/**
 * DELETE /api/platform/follow — unfollow the platform feed.
 * Body: { followerId? }
 */
export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontFollowRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json().catch(() => ({}))) as {
      followerId?: unknown;
    };
    const { followerId, providedId } = await resolveFollowerId(
      body.followerId
    );
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    // Unfollow every id this request may manage — covers the anonymous row a
    // shopper created before signing in, so the toggle always clears state.
    const deleteIds = await manageableFollowerIds(followerId, providedId);
    await db
      .delete(platformFollows)
      .where(inArray(platformFollows.followerId, deleteIds));

    return NextResponse.json({
      success: true,
      count: await followerCount(),
      following: false,
    });
  } catch (error) {
    console.error("[api/platform/follow] DELETE failed:", error);
    return createErrorResponse(error, "Failed to unfollow");
  }
}

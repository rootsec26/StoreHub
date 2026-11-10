import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { platformFollows } from "@/db/schema";
import { getSession } from "@/lib/auth";
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
): Promise<string | null> {
  const session = await getSession();
  if (session?.id) return session.id;
  return isValidFollowerId(provided) ? provided : null;
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
    const followerId = await resolveFollowerId(
      request.nextUrl.searchParams.get("followerId")
    );

    const [count, followingRows] = await Promise.all([
      followerCount(),
      followerId
        ? db
            .select({ id: platformFollows.id })
            .from(platformFollows)
            .where(eq(platformFollows.followerId, followerId))
            .limit(1)
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      count,
      following: followingRows.length > 0,
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
    const followerId = await resolveFollowerId(body.followerId);
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ id: platformFollows.id })
      .from(platformFollows)
      .where(eq(platformFollows.followerId, followerId))
      .limit(1);

    if (existing.length === 0) {
      try {
        await db.insert(platformFollows).values({ followerId });
      } catch (error) {
        // Unique-violation race: another request already created the row.
        if ((error as { code?: string }).code !== "23505") throw error;
      }
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
    const followerId = await resolveFollowerId(body.followerId);
    if (!followerId) {
      return NextResponse.json(
        { error: "A follower id is required", code: "MISSING_FOLLOWER_ID" },
        { status: 400 }
      );
    }

    await db
      .delete(platformFollows)
      .where(eq(platformFollows.followerId, followerId));

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

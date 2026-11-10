import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeFollowers, users } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_RECENT_FOLLOWERS = 10;

function maskVisitorId(userId: string): string {
  // Anonymous visitor ids are random uuids — only the tail is shown.
  return `••••${userId.slice(-4)}`;
}

/**
 * GET /api/dashboard/followers — the merchant's follower stats.
 * Returns the total count plus the most recent followers. When a follower id
 * matches an app user, their name/email is shown; anonymous visitors are
 * masked to the last 4 characters of their generated id.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const userStore = await getAccessibleStores(session.id);
    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const storeId = userStore[0].id;

    const [countRows, recent] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeFollowers)
        .where(eq(storeFollowers.storeId, storeId)),
      db
        .select({
          id: storeFollowers.id,
          userId: storeFollowers.userId,
          createdAt: storeFollowers.createdAt,
          followerName: users.name,
          followerEmail: users.email,
        })
        .from(storeFollowers)
        // Follower ids that are app user ids resolve to a profile; visitor
        // ids simply produce NULLs and fall back to the masked label.
        .leftJoin(users, sql`${users.id}::text = ${storeFollowers.userId}`)
        .where(eq(storeFollowers.storeId, storeId))
        .orderBy(desc(storeFollowers.createdAt))
        .limit(MAX_RECENT_FOLLOWERS),
    ]);

    return NextResponse.json({
      count: countRows[0]?.count ?? 0,
      recentFollowers: recent.map((row) => ({
        id: row.id,
        label:
          row.followerName?.trim() ||
          row.followerEmail ||
          maskVisitorId(row.userId),
        isRegistered: Boolean(row.followerEmail),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[api/dashboard/followers] request failed:", error);
    return createErrorResponse(error, "Failed to load followers");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  storeGroupMembers,
  storeGroupPosts,
  storeGroups,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { getStoreBySlug } from "@/lib/storefront";
import { storefrontFollowRateLimiter, withRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FOLLOWER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_POSTS = 100;

function isValidFollowerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FOLLOWER_ID_PATTERN.test(value) &&
    value.length <= 64
  );
}

/** Signed-in users are identified by session; visitors by localStorage id. */
async function resolveMemberId(provided: unknown): Promise<string | null> {
  const session = await getSession();
  if (session?.id) return session.id;
  return isValidFollowerId(provided) ? provided : null;
}

/**
 * GET /api/storefront/group?slug=<store>&followerId=<anon-id>
 * Public: group metadata + the caller's membership status. Post contents are
 * only included when the caller is an approved member.
 */
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug") ?? "";
    const store = await getStoreBySlug(slug);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const groupRows = await db
      .select()
      .from(storeGroups)
      .where(eq(storeGroups.storeId, store.id))
      .limit(1);
    const group = groupRows[0];
    if (!group) {
      return NextResponse.json({ group: null });
    }

    const memberId = await resolveMemberId(
      request.nextUrl.searchParams.get("followerId")
    );

    let membership: "none" | "pending" | "approved" | "rejected" = "none";
    let posts: {
      id: string;
      authorName: string;
      content: string;
      createdAt: string;
    }[] = [];

    if (memberId) {
      const memberRows = await db
        .select({ status: storeGroupMembers.status })
        .from(storeGroupMembers)
        .where(
          sql`${storeGroupMembers.groupId} = ${group.id} AND ${storeGroupMembers.userId} = ${memberId}`
        )
        .limit(1);
      const status = memberRows[0]?.status;
      if (status === "pending" || status === "approved" || status === "rejected") {
        membership = status;
      }

      if (membership === "approved") {
        const rows = await db
          .select({
            id: storeGroupPosts.id,
            authorName: storeGroupPosts.authorName,
            content: storeGroupPosts.content,
            createdAt: storeGroupPosts.createdAt,
          })
          .from(storeGroupPosts)
          .where(eq(storeGroupPosts.groupId, group.id))
          .orderBy(desc(storeGroupPosts.createdAt))
          .limit(MAX_POSTS);
        posts = rows.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        }));
      }
    }

    return NextResponse.json({
      group: {
        id: group.id,
        title: group.title,
        description: group.description,
        storeName: store.name,
        storeSlug: store.slug,
      },
      membership,
      posts,
    });
  } catch (error) {
    console.error("[api/storefront/group] GET failed:", error);
    return createErrorResponse(error, "Failed to load store group");
  }
}

/**
 * POST /api/storefront/group — request to join a store's group.
 * Body: { slug, followerId? } — creates a pending membership (idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      storefrontFollowRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const slug = typeof body?.slug === "string" ? body.slug : "";
    const store = await getStoreBySlug(slug);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const groupRows = await db
      .select({ id: storeGroups.id })
      .from(storeGroups)
      .where(eq(storeGroups.storeId, store.id))
      .limit(1);
    const group = groupRows[0];
    if (!group) {
      return NextResponse.json(
        { error: "This store has no group", code: "NO_GROUP" },
        { status: 404 }
      );
    }

    const memberId = await resolveMemberId(body?.followerId);
    if (!memberId) {
      return NextResponse.json(
        { error: "A member id is required", code: "MISSING_MEMBER_ID" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ status: storeGroupMembers.status })
      .from(storeGroupMembers)
      .where(
        sql`${storeGroupMembers.groupId} = ${group.id} AND ${storeGroupMembers.userId} = ${memberId}`
      )
      .limit(1);

    const current = existing[0]?.status;
    if (current === "approved") {
      return NextResponse.json({ success: true, membership: "approved" });
    }
    if (current === "pending") {
      return NextResponse.json({ success: true, membership: "pending" });
    }

    if (current) {
      // rejected (or unknown) — allow re-requesting by flipping to pending.
      await db
        .update(storeGroupMembers)
        .set({ status: "pending" })
        .where(
          sql`${storeGroupMembers.groupId} = ${group.id} AND ${storeGroupMembers.userId} = ${memberId}`
        );
    } else {
      try {
        await db
          .insert(storeGroupMembers)
          .values({ groupId: group.id, userId: memberId, status: "pending" });
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error;
      }
    }

    return NextResponse.json({ success: true, membership: "pending" });
  } catch (error) {
    console.error("[api/storefront/group] POST failed:", error);
    return createErrorResponse(error, "Failed to send join request");
  }
}

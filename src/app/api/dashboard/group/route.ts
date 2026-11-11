import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeGroupMembers, storeGroupPosts, storeGroups } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

async function requireStoreId(): Promise<{ storeId: string; error?: never } | { error: NextResponse }> {
  const session = await getSession();
  if (!session?.id) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }
  const userStore = await getAccessibleStores(session.id);
  if (userStore.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      ),
    };
  }
  return { storeId: userStore[0].id };
}

/**
 * GET /api/dashboard/group — the merchant's store group plus member/post
 * counters. Returns { group: null } when the group hasn't been created yet.
 */
export async function GET() {
  try {
    const ctx = await requireStoreId();
    if ("error" in ctx) return ctx.error;

    const groupRows = await db
      .select()
      .from(storeGroups)
      .where(eq(storeGroups.storeId, ctx.storeId))
      .limit(1);
    const group = groupRows[0];
    if (!group) {
      return NextResponse.json({ group: null, stats: null });
    }

    const [postCount, pendingCount, memberCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeGroupPosts)
        .where(eq(storeGroupPosts.groupId, group.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeGroupMembers)
        .where(
          sql`${storeGroupMembers.groupId} = ${group.id} AND ${storeGroupMembers.status} = 'pending'`
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeGroupMembers)
        .where(
          sql`${storeGroupMembers.groupId} = ${group.id} AND ${storeGroupMembers.status} = 'approved'`
        ),
    ]);

    return NextResponse.json({
      group: {
        id: group.id,
        title: group.title,
        description: group.description,
        createdAt: group.createdAt.toISOString(),
      },
      stats: {
        posts: postCount[0]?.count ?? 0,
        pendingMembers: pendingCount[0]?.count ?? 0,
        members: memberCount[0]?.count ?? 0,
      },
    });
  } catch (error) {
    console.error("[api/dashboard/group] GET failed:", error);
    return createErrorResponse(error, "Failed to load store group");
  }
}

/**
 * PUT /api/dashboard/group — create or update the merchant's group.
 * Body: { title?, description? }
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireStoreId();
    if ("error" in ctx) return ctx.error;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
        : "";

    const existing = await db
      .select({ id: storeGroups.id })
      .from(storeGroups)
      .where(eq(storeGroups.storeId, ctx.storeId))
      .limit(1);

    let groupId: string;
    if (existing[0]) {
      groupId = existing[0].id;
      await db
        .update(storeGroups)
        .set({ title, description, updatedAt: new Date() })
        .where(eq(storeGroups.id, groupId));
    } else {
      const [inserted] = await db
        .insert(storeGroups)
        .values({ storeId: ctx.storeId, title, description })
        .returning({ id: storeGroups.id });
      groupId = inserted.id;
    }

    return NextResponse.json({ success: true, groupId });
  } catch (error) {
    console.error("[api/dashboard/group] PUT failed:", error);
    return createErrorResponse(error, "Failed to save store group");
  }
}

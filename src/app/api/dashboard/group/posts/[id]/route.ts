import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeGroupPosts, storeGroups } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/dashboard/group/posts/[id] — merchant deletes own post. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid post id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const groupRows = await db
      .select({ id: storeGroups.id })
      .from(storeGroups)
      .where(eq(storeGroups.storeId, userStore[0].id))
      .limit(1);
    const group = groupRows[0];
    if (!group) {
      return NextResponse.json(
        { error: "No store group", code: "NO_GROUP" },
        { status: 404 }
      );
    }

    const deleted = await db
      .delete(storeGroupPosts)
      .where(
        and(
          eq(storeGroupPosts.id, id),
          eq(storeGroupPosts.groupId, group.id)
        )
      )
      .returning({ id: storeGroupPosts.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Post not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/dashboard/group/posts/:id] DELETE failed:", error);
    return createErrorResponse(error, "Failed to delete post");
  }
}

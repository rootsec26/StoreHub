import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { platformPosts } from "@/db/schema";
import { isAdminAuthorized } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/platform/feed/[id] — super-admin only. Removes a feed post.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdminAuthorized())) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
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

    await db.delete(platformPosts).where(eq(platformPosts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/platform/feed/:id] DELETE failed:", error);
    return createErrorResponse(error, "Failed to delete post");
  }
}

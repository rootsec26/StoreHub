import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeMembers } from "@/db/schema";
import { getSession, resolveStoreAccess } from "@/lib/auth";
import { createErrorResponse, formatErrorForLog } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Remove an admin member from the store. Owner only — the owner row
// itself lives on stores.owner_id and can never be removed here.
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const access = await resolveStoreAccess(session.id);
    if (!access) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (access.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the store owner can remove members", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const { userId } = await context.params;
    if (!UUID_PATTERN.test(userId)) {
      return NextResponse.json(
        { error: "Invalid member ID", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    if (userId === access.store.ownerId) {
      return NextResponse.json(
        { error: "The store owner cannot be removed", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const deleted = await db
      .delete(storeMembers)
      .where(
        and(
          eq(storeMembers.storeId, access.store.id),
          eq(storeMembers.userId, userId)
        )
      )
      .returning({ id: storeMembers.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Member not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", formatErrorForLog(error));
    return createErrorResponse(error, "Failed to remove member");
  }
}

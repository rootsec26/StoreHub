import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeGroupMembers, storeGroups } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected"]);

async function requireGroupId(): Promise<string | NextResponse> {
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
  return group.id;
}

function isResponse(value: string | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * PATCH /api/dashboard/group/members/[id] — set member status.
 * Body: { status: "pending" | "approved" | "rejected" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const groupId = await requireGroupId();
    if (isResponse(groupId)) return groupId;

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid member id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Invalid status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(storeGroupMembers)
      .set({ status })
      .where(
        and(
          eq(storeGroupMembers.id, id),
          eq(storeGroupMembers.groupId, groupId)
        )
      )
      .returning({ id: storeGroupMembers.id });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Member not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[api/dashboard/group/members/:id] PATCH failed:", error);
    return createErrorResponse(error, "Failed to update member");
  }
}

/** DELETE /api/dashboard/group/members/[id] — remove a member entirely. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const groupId = await requireGroupId();
    if (isResponse(groupId)) return groupId;

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid member id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(storeGroupMembers)
      .where(
        and(
          eq(storeGroupMembers.id, id),
          eq(storeGroupMembers.groupId, groupId)
        )
      )
      .returning({ id: storeGroupMembers.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Member not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/dashboard/group/members/:id] DELETE failed:", error);
    return createErrorResponse(error, "Failed to remove member");
  }
}

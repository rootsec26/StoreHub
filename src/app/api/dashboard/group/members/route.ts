import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storeGroupMembers, storeGroups, users } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

function maskVisitorId(userId: string): string {
  return `••••${userId.slice(-4)}`;
}

/**
 * GET /api/dashboard/group/members?status=pending|approved|all
 * Lists group members. Registered users resolve to name/email; anonymous
 * visitor ids are masked to the last 4 characters.
 */
export async function GET(request: NextRequest) {
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

    const groupRows = await db
      .select({ id: storeGroups.id })
      .from(storeGroups)
      .where(eq(storeGroups.storeId, userStore[0].id))
      .limit(1);
    const group = groupRows[0];
    if (!group) {
      return NextResponse.json({ members: [] });
    }

    const status = request.nextUrl.searchParams.get("status") ?? "all";
    const conditions = [eq(storeGroupMembers.groupId, group.id)];
    if (status === "pending" || status === "approved" || status === "rejected") {
      conditions.push(eq(storeGroupMembers.status, status));
    }

    const members = await db
      .select({
        id: storeGroupMembers.id,
        userId: storeGroupMembers.userId,
        status: storeGroupMembers.status,
        createdAt: storeGroupMembers.createdAt,
        memberName: users.name,
        memberEmail: users.email,
      })
      .from(storeGroupMembers)
      .leftJoin(users, sql`${users.id}::text = ${storeGroupMembers.userId}`)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(desc(storeGroupMembers.createdAt))
      .limit(200);

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        label:
          m.memberName?.trim() ||
          m.memberEmail ||
          maskVisitorId(m.userId),
        status: m.status,
        isRegistered: Boolean(m.memberEmail),
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[api/dashboard/group/members] GET failed:", error);
    return createErrorResponse(error, "Failed to load members");
  }
}

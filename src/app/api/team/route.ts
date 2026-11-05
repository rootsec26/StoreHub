import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeInvitations, storeMembers, users } from "@/db/schema";
import { getSession, resolveStoreAccess } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

// Team overview: current members + pending invitations for the
// store the session user belongs to (owner or admin).
export async function GET() {
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

    const isOwner = access.role === "OWNER";
    const storeId = access.store.id;
    const now = new Date();

    const memberRows = await db
      .select({
        userId: storeMembers.userId,
        role: storeMembers.role,
        createdAt: storeMembers.createdAt,
        name: users.name,
        email: users.email,
      })
      .from(storeMembers)
      .innerJoin(users, eq(storeMembers.userId, users.id))
      .where(eq(storeMembers.storeId, storeId))
      .orderBy(asc(storeMembers.createdAt));

    const ownerRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, access.store.ownerId))
      .limit(1);

    const invitationRows = await db
      .select({
        id: storeInvitations.id,
        email: storeInvitations.email,
        role: storeInvitations.role,
        status: storeInvitations.status,
        expiresAt: storeInvitations.expiresAt,
        createdAt: storeInvitations.createdAt,
      })
      .from(storeInvitations)
      .where(eq(storeInvitations.storeId, storeId))
      .orderBy(asc(storeInvitations.createdAt));

    const invitations = invitationRows.filter(
      (invite) => invite.status === "PENDING" && invite.expiresAt > now
    );

    return NextResponse.json({
      store: {
        id: access.store.id,
        name: access.store.name,
        slug: access.store.slug,
      },
      isOwner,
      currentUserId: session.id,
      owner: ownerRows[0]
        ? {
            userId: ownerRows[0].id,
            name: ownerRows[0].name,
            email: ownerRows[0].email,
            role: "OWNER",
          }
        : null,
      members: memberRows,
      invitations: invitations.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get team error:", error);
    return createErrorResponse(error, "Failed to fetch team");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeInvitations, storeMembers } from "@/db/schema";
import { createSession, getSession, resolveStoreAccess } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

// Accept a team invitation. Requires a logged-in session whose email
// matches the invited address; on success the user becomes an ADMIN
// member of the store and the session cookie is re-issued with the
// store context so the dashboard works immediately.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token || token.length > 128) {
      return NextResponse.json(
        { error: "Invitation token is required", code: "INVALID_TOKEN" },
        { status: 400 }
      );
    }

    const inviteRows = await db
      .select()
      .from(storeInvitations)
      .where(eq(storeInvitations.token, token))
      .limit(1);

    const invite = inviteRows[0];
    if (!invite) {
      return NextResponse.json(
        { error: "Invitation not found", code: "INVITE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (invite.status !== "PENDING") {
      return NextResponse.json(
        { error: "This invitation was already used or revoked", code: "INVITE_CLOSED" },
        { status: 410 }
      );
    }

    if (invite.expiresAt <= new Date()) {
      await db
        .update(storeInvitations)
        .set({ status: "EXPIRED" })
        .where(eq(storeInvitations.id, invite.id));
      return NextResponse.json(
        { error: "This invitation has expired", code: "INVITE_EXPIRED" },
        { status: 410 }
      );
    }

    if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: "This invitation was sent to a different email address",
          code: "EMAIL_MISMATCH",
        },
        { status: 403 }
      );
    }

    // The user must not already belong to this store (as owner or member).
    const existingAccess = await resolveStoreAccess(session.id);
    if (existingAccess?.store.id === invite.storeId) {
      return NextResponse.json(
        { error: "You are already a member of this store", code: "ALREADY_MEMBER" },
        { status: 409 }
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(storeMembers)
        .values({
          storeId: invite.storeId,
          userId: session.id,
          role: invite.role,
        })
        .onConflictDoNothing();

      await tx
        .update(storeInvitations)
        .set({
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedByUserId: session.id,
        })
        .where(
          and(
            eq(storeInvitations.id, invite.id),
            eq(storeInvitations.status, "PENDING")
          )
        );
    });

    // Re-issue the session cookie with the new store membership so the
    // dashboard and API routes see storeId/role immediately.
    const access = await resolveStoreAccess(session.id);
    const newToken = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: access?.store.id,
      storeSlug: access?.store.slug,
      storeName: access?.store.name,
      role: access?.role,
    });

    const response = NextResponse.json({
      success: true,
      store: access
        ? { id: access.store.id, name: access.store.name, slug: access.store.slug }
        : null,
    });

    response.cookies.set("session", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Accept invite error:", error);
    return createErrorResponse(error, "Failed to accept invitation");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeInvitations, storeMembers, users } from "@/db/schema";
import { getSession, resolveStoreAccess } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function requireOwner() {
  const session = await getSession();
  if (!session?.id) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  const access = await resolveStoreAccess(session.id);
  if (!access) {
    return {
      response: NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      ),
    };
  }

  if (access.role !== "OWNER") {
    return {
      response: NextResponse.json(
        { error: "Only the store owner can manage invitations", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }

  return { session, access };
}

// Create an admin invitation. Returns the accept URL — there is no
// outbound email channel for invites yet, so the owner shares the link.
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOwner();
    if ("response" in ctx) return ctx.response;
    const { session, access } = ctx;

    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = "ADMIN";

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required", code: "INVALID_EMAIL" },
        { status: 400 }
      );
    }

    // Cannot invite the owner or an existing member.

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser[0]) {
      const alreadyMember = await db
        .select({ id: storeMembers.id })
        .from(storeMembers)
        .where(
          and(
            eq(storeMembers.storeId, access.store.id),
            eq(storeMembers.userId, existingUser[0].id)
          )
        )
        .limit(1);

      if (alreadyMember[0] || existingUser[0].id === access.store.ownerId) {
        return NextResponse.json(
          { error: "This user is already part of the store", code: "ALREADY_MEMBER" },
          { status: 409 }
        );
      }
    }

    // Revoke any still-pending invite for the same email to keep one link.
    await db
      .update(storeInvitations)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(storeInvitations.storeId, access.store.id),
          eq(storeInvitations.email, email),
          eq(storeInvitations.status, "PENDING")
        )
      );

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const inserted = await db
      .insert(storeInvitations)
      .values({
        storeId: access.store.id,
        email,
        role,
        token,
        status: "PENDING",
        invitedByUserId: session.id,
        expiresAt,
      })
      .returning();

    const invite = inserted[0];
    const inviteUrl = `${request.nextUrl.origin}/accept-invite?token=${invite.token}`;

    return NextResponse.json(
      {
        invitation: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
        inviteUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create invitation error:", error);
    return createErrorResponse(error, "Failed to create invitation");
  }
}

// Revoke a pending invitation: DELETE /api/team/invitations?id=<uuid>
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireOwner();
    if ("response" in ctx) return ctx.response;
    const { access } = ctx;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Invitation ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(storeInvitations)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(storeInvitations.id, id),
          eq(storeInvitations.storeId, access.store.id),
          eq(storeInvitations.status, "PENDING")
        )
      )
      .returning({ id: storeInvitations.id });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Invitation not found or already used", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revoke invitation error:", error);
    return createErrorResponse(error, "Failed to revoke invitation");
  }
}

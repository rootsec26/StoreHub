import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { storeInvitations, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ token: string }>;
}

// Public lookup for the accept-invite page: validates the token and
// returns the store name / invited email / expiry without requiring auth.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length > 128) {
      return NextResponse.json(
        { error: "Invalid invitation link", code: "INVALID_TOKEN" },
        { status: 400 }
      );
    }

    const rows = await db
      .select({
        id: storeInvitations.id,
        email: storeInvitations.email,
        role: storeInvitations.role,
        status: storeInvitations.status,
        expiresAt: storeInvitations.expiresAt,
        storeName: stores.name,
        storeSlug: stores.slug,
      })
      .from(storeInvitations)
      .innerJoin(stores, eq(storeInvitations.storeId, stores.id))
      .where(eq(storeInvitations.token, token))
      .limit(1);

    const invite = rows[0];
    if (!invite) {
      return NextResponse.json(
        { error: "Invitation not found", code: "INVITE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const expired = invite.expiresAt <= new Date();
    const usable = invite.status === "PENDING" && !expired;

    return NextResponse.json({
      invitation: {
        email: invite.email,
        role: invite.role,
        storeName: invite.storeName,
        storeSlug: invite.storeSlug,
        status: usable ? "PENDING" : expired ? "EXPIRED" : invite.status,
      },
    });
  } catch (error) {
    console.error("Invite lookup error:", error);
    return createErrorResponse(error, "Failed to load invitation");
  }
}

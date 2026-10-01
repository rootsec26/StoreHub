import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getAccountStatus } from "@/lib/payments/stripe";
import { createErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    if (accountId !== userStore[0].stripeAccountId) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const status = await getAccountStatus(accountId);

    return NextResponse.json({
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
      requirements: status.requirements,
    });
  } catch (error) {
    console.error("Stripe test error:", error);
    return createErrorResponse(error, "Failed to test Stripe connection");
  }
}
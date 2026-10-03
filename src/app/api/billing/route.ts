import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { isPlan } from "@/lib/plans";
import { buildBillingInfo } from "@/lib/billing";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

// Current subscription + product usage for the signed-in store
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const info = await buildBillingInfo(session.id);
    if (!info) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(info);
  } catch (error) {
    console.error("Get billing error:", error);
    return createErrorResponse(error, "Failed to fetch billing info");
  }
}

// Plan changes are voucher-gated: only downgrades are handled here.
// Upgrading requires an activation code via POST /api/billing/redeem-code.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!isPlan(plan)) {
      return NextResponse.json({ error: "Invalid plan", code: "INVALID_PLAN" }, { status: 400 });
    }

    if (plan !== "free") {
      return NextResponse.json(
        {
          error:
            "Upgrades require a paid activation code. Redeem one from Billing.",
          code: "PAYMENT_REQUIRED",
        },
        { status: 402 }
      );
    }

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    await db
      .update(stores)
      .set({ plan, planExpiresAt: null })
      .where(eq(stores.id, store[0].id));

    const info = await buildBillingInfo(session.id);
    return NextResponse.json(info);
  } catch (error) {
    console.error("Update plan error:", error);
    return createErrorResponse(error, "Failed to update plan");
  }
}

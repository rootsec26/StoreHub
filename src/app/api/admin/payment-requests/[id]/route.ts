import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";
import { getBillingPlan } from "@/lib/billing-plans";
import { extendStorehubPaidPeriod } from "@/lib/products-server";

/**
 * PATCH /api/admin/payment-requests/[id]
 * Body: { action: "approve" | "reject", reason?: string }
 *
 * Approve is idempotent + transactional: only a still-pending row transitions,
 * then the owner's products.storehub is set active with currentPeriodEnd
 * extended from the later of (now, existing period end). Re-approving an
 * already-approved request is a no-op success.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.email)) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      reason?: unknown;
    } | null;
    const action = body?.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Invalid action", code: "INVALID_ACTION" },
        { status: 400 }
      );
    }
    const reason =
      typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const rows = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);
    const req = rows[0];
    if (!req) {
      return NextResponse.json(
        { error: "Request not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Idempotent: already-reviewed requests return their current state.
    if (req.status !== "pending") {
      return NextResponse.json({
        success: true,
        status: req.status,
        alreadyReviewed: true,
      });
    }

    if (action === "reject") {
      await db
        .update(paymentRequests)
        .set({
          status: "rejected",
          rejectReason: reason,
          reviewedBy: session.email,
          reviewedAt: new Date(),
        })
        .where(eq(paymentRequests.id, id));
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ---- approve (transactional) ----
    const plan = getBillingPlan(req.plan);
    const durationDays = plan?.durationDays ?? 30;

    await db.transaction(async (tx) => {
      // Re-check pending inside the transaction (double-click guard).
      const locked = await tx
        .select({ status: paymentRequests.status })
        .from(paymentRequests)
        .where(eq(paymentRequests.id, id))
        .for("update")
        .limit(1);
      if (!locked[0] || locked[0].status !== "pending") return;

      // Shared with manual grants — identical entitlement rules.
      await extendStorehubPaidPeriod(tx, req.userId, durationDays);

      await tx
        .update(paymentRequests)
        .set({
          status: "approved",
          reviewedBy: session.email,
          reviewedAt: new Date(),
        })
        .where(eq(paymentRequests.id, id));
    });

    const after = await db
      .select({ status: paymentRequests.status })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);

    return NextResponse.json({
      success: true,
      status: after[0]?.status ?? "approved",
    });
  } catch (error) {
    console.error("[admin] payment-request review failed:", error);
    return createErrorResponse(error, "Failed to review request");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests, stores, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";
import { extendStorehubPaidPeriod } from "@/lib/products-server";

const MAX_GRANT_DAYS = 366;

/**
 * POST /api/admin/payment-requests/grant
 * Admin-only manual subscription grant (no money moved).
 *
 * Body: { email? | userId? | storeSlug?, days?, reason }
 *  - `reason` is MANDATORY — it is stored on the audit row.
 *  - Creates an APPROVED payment_requests row with method 'manual_grant',
 *    amount 0, then extends currentPeriodEnd through the SAME transactional
 *    helper used by payment approval, so entitlement rules are identical.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.email)) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid payload", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required for manual grants", code: "REASON_REQUIRED" },
        { status: 400 }
      );
    }

    const daysRaw = body.days;
    const days =
      typeof daysRaw === "number" && Number.isFinite(daysRaw)
        ? Math.floor(daysRaw)
        : 30;
    if (days < 1 || days > MAX_GRANT_DAYS) {
      return NextResponse.json(
        { error: `days must be between 1 and ${MAX_GRANT_DAYS}`, code: "BAD_DAYS" },
        { status: 400 }
      );
    }

    // Resolve the target user: explicit userId, email, or store slug.
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";
    const storeSlug =
      typeof body.storeSlug === "string" ? body.storeSlug.trim() : "";

    let targetUserId: string | null = null;
    let targetStoreId: string | null = null;

    if (userId) {
      targetUserId = userId;
    } else if (email) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      targetUserId = rows[0]?.id ?? null;
    } else if (storeSlug) {
      const rows = await db
        .select({ id: stores.id, ownerId: stores.ownerId })
        .from(stores)
        .where(eq(stores.slug, storeSlug))
        .limit(1);
      targetUserId = rows[0]?.ownerId ?? null;
      targetStoreId = rows[0]?.id ?? null;
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: "User or store not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const grantRef = `GRANT-${randomUUID().slice(0, 8).toUpperCase()}`;
    let newEnd = "";

    await db.transaction(async (tx) => {
      // Audit row first: approved manual grant, zero amount.
      // reject_reason doubles as the free-text grant reason (no dedicated
      // column exists; the row is 'approved' so it never renders as a
      // rejection in the UI).
      await tx.insert(paymentRequests).values({
        userId: targetUserId!,
        storeId: targetStoreId,
        productKey: "storehub",
        plan: "storehub_monthly",
        amount: "0.00",
        currency: "EGP",
        method: "manual_grant",
        referenceCode: grantRef,
        senderPhone: "manual",
        transactionId: grantRef,
        transactionIdNormalized: grantRef.toLowerCase(),
        status: "approved",
        reviewedBy: session.email,
        reviewedAt: new Date(),
        rejectReason: reason,
      });

      newEnd = await extendStorehubPaidPeriod(tx, targetUserId!, days);
    });

    return NextResponse.json({
      success: true,
      referenceCode: grantRef,
      days,
      currentPeriodEnd: newEnd,
    });
  } catch (error) {
    console.error("[admin] manual grant failed:", error);
    return createErrorResponse(error, "Failed to grant subscription");
  }
}

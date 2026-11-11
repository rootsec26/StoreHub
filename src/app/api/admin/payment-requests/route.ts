import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests, users, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";

/**
 * GET /api/admin/payment-requests
 * Admin-only: lists payment requests (pending first) with owner/store info.
 * Proof payloads are NEVER in list responses — fetch one via
 * GET /api/admin/payment-requests/[id]/proof.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.email)) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const rows = await db
      .select({
        id: paymentRequests.id,
        userId: paymentRequests.userId,
        storeId: paymentRequests.storeId,
        productKey: paymentRequests.productKey,
        plan: paymentRequests.plan,
        amount: paymentRequests.amount,
        currency: paymentRequests.currency,
        method: paymentRequests.method,
        referenceCode: paymentRequests.referenceCode,
        senderPhone: paymentRequests.senderPhone,
        transactionId: paymentRequests.transactionId,
        hasProof: sql<boolean>`${paymentRequests.proofData} <> ''`,
        status: paymentRequests.status,
        reviewedBy: paymentRequests.reviewedBy,
        reviewedAt: paymentRequests.reviewedAt,
        rejectReason: paymentRequests.rejectReason,
        createdAt: paymentRequests.createdAt,
        userEmail: users.email,
        userName: users.name,
        storeName: stores.name,
        storeSlug: stores.slug,
      })
      .from(paymentRequests)
      .leftJoin(users, eq(paymentRequests.userId, users.id))
      .leftJoin(stores, eq(paymentRequests.storeId, stores.id))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(100);

    return NextResponse.json({ requests: rows });
  } catch (error) {
    console.error("[admin] payment-requests GET failed:", error);
    return createErrorResponse(error, "Failed to load requests");
  }
}

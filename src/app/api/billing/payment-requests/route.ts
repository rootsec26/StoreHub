import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { getSessionWithStore } from "@/lib/auth";
import { createErrorResponse, extractDbErrorInfo } from "@/lib/errors";
import { withRateLimit, authRateLimiter } from "@/lib/rate-limit";
import {
  ACTIVE_PAYMENT_METHODS,
  MAX_PENDING_REQUESTS,
  getBillingPlan,
  getPaymentInstructions,
  isBillingMethod,
  normalizeEgyptianPhone,
  normalizeTransactionId,
} from "@/lib/billing-plans";
import { getUserProductState } from "@/lib/products-server";
import { evaluateStorehubEntitlement } from "@/lib/products";

/**
 * GET  /api/billing/payment-requests → plans, instructions, own requests,
 *      current StoreHub entitlement.
 * POST /api/billing/payment-requests → create a manual payment request.
 *      Amount/currency/duration ALWAYS come from server plan config.
 */
export async function GET() {
  try {
    const session = await getSessionWithStore();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const [requests, state] = await Promise.all([
      db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.userId, session.id))
        .orderBy(desc(paymentRequests.createdAt))
        .limit(20),
      getUserProductState(session.id),
    ]);

    return NextResponse.json({
      plans: Object.values(
        // Only expose display-safe plan fields.
        (await import("@/lib/billing-plans")).STOREHUB_PLANS
      ).map((p) => ({
        key: p.key,
        nameKey: p.nameKey,
        price: p.price,
        currency: p.currency,
        durationDays: p.durationDays,
      })),
      methods: ACTIVE_PAYMENT_METHODS,
      instructions: getPaymentInstructions(),
      requests: requests.map((r) => ({
        id: r.id,
        plan: r.plan,
        amount: r.amount,
        currency: r.currency,
        method: r.method,
        referenceCode: r.referenceCode,
        senderPhone: r.senderPhone,
        transactionId: r.transactionId,
        hasProof: r.proofData.length > 0,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
      })),
      entitlement: state.products.storehub ?? null,
      hasStore: state.hasStore,
    });
  } catch (error) {
    console.error("[billing] GET failed:", error);
    return createErrorResponse(error, "Failed to load billing");
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, authRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await getSessionWithStore();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
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

    const plan = getBillingPlan(body.plan);
    if (!plan) {
      return NextResponse.json(
        { error: "Unknown plan", code: "UNKNOWN_PLAN" },
        { status: 400 }
      );
    }
    if (!isBillingMethod(body.method) || !ACTIVE_PAYMENT_METHODS.includes(body.method)) {
      return NextResponse.json(
        { error: "Unsupported payment method", code: "BAD_METHOD" },
        { status: 400 }
      );
    }

    const senderPhone = normalizeEgyptianPhone(body.senderPhone);
    if (!senderPhone) {
      return NextResponse.json(
        {
          error: "Valid Egyptian mobile number required",
          code: "BAD_SENDER_PHONE",
        },
        { status: 400 }
      );
    }
    const transactionId = normalizeTransactionId(body.transactionId);
    if (!transactionId) {
      return NextResponse.json(
        {
          error: "Transaction ID (operation number) required",
          code: "BAD_TRANSACTION_ID",
        },
        { status: 400 }
      );
    }

    // Anti-spam: cap concurrent pending requests per user.
    const pending = await db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.userId, session.id),
          eq(paymentRequests.status, "pending")
        )
      );
    if (pending.length >= MAX_PENDING_REQUESTS) {
      return NextResponse.json(
        {
          error: "Too many pending payment requests",
          code: "TOO_MANY_PENDING",
        },
        { status: 429 }
      );
    }

    // Receipt reuse guard — mirrors payment_requests_txn_unique: only
    // pending/approved rows burn a transaction id; rejected/expired rows
    // release it so a corrected request can resubmit the same receipt.
    const dup = await db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.transactionIdNormalized, transactionId),
          inArray(paymentRequests.status, ["pending", "approved"])
        )
      )
      .limit(1);
    if (dup.length > 0) {
      return NextResponse.json(
        {
          error: "This transaction was already submitted",
          code: "DUPLICATE_TRANSACTION",
        },
        { status: 409 }
      );
    }

    const state = await getUserProductState(session.id);
    const entitlement = evaluateStorehubEntitlement({
      stored: state.products.storehub,
      hasStore: Boolean(session.storeId),
      storeCreatedAt: null,
    });
    // Already-paid-active users don't need a new request (renewal allowed
    // only inside the last 7 days of the period — keep it simple: block
    // only while comfortably active).
    if (entitlement.status === "active" && entitlement.currentPeriodEnd) {
      const end = new Date(entitlement.currentPeriodEnd).getTime();
      if (end - Date.now() > 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          {
            error: "Subscription already active",
            code: "ALREADY_ACTIVE",
          },
          { status: 409 }
        );
      }
    }

    const referenceCode = `PR-${randomBytes(4).toString("hex").toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    let row: (typeof paymentRequests.$inferSelect) | undefined;
    try {
      const inserted = await db
        .insert(paymentRequests)
        .values({
          userId: session.id,
          storeId: session.storeId ?? null,
          productKey: plan.productKey,
          plan: plan.key,
          amount: plan.price,
          currency: plan.currency,
          method: body.method,
          referenceCode,
          senderPhone,
          transactionId: String(body.transactionId).trim(),
          transactionIdNormalized: transactionId,
        })
        .returning();
      row = inserted[0];
    } catch (error) {
      // Unique-index race: another request claimed this receipt (or this
      // reference code) between the pre-check and the insert.
      const { code = "" } = extractDbErrorInfo(error);
      if (code === "23505") {
        return NextResponse.json(
          {
            error: "This transaction was already submitted",
            code: "DUPLICATE_TRANSACTION",
          },
          { status: 409 }
        );
      }
      throw error;
    }
    if (!row) {
      return createErrorResponse(new Error("insert returned no row"));
    }

    return NextResponse.json(
      {
        success: true,
        request: {
          id: row.id,
          referenceCode: row.referenceCode,
          amount: row.amount,
          currency: row.currency,
          method: row.method,
          plan: row.plan,
          senderPhone: row.senderPhone,
          transactionId: row.transactionId,
          status: row.status,
          createdAt: row.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[billing] POST failed:", error);
    return createErrorResponse(error, "Failed to create payment request");
  }
}

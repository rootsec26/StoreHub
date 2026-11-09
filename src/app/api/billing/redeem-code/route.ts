import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { activationCodes, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { buildBillingInfo } from "@/lib/billing";
import { createErrorResponse } from "@/lib/errors";
import {
  CREDIT_VALIDITY_DAYS,
  activationCodeSpec,
  isActivationCodeType,
} from "@/lib/billing-packages";
import { PaywallError, grantCredits } from "@/lib/paywall";
import { isFreeMode } from "@/lib/free-mode";
import { validateRequest, redeemCodeSchema, formatZodError } from "@/lib/validators";

export const runtime = "nodejs";

interface RedeemErrorBody {
  error: string;
  code: "KOD_INVALID" | "KOD_USED" | "KOD_EXPIRED" | string;
}

function redeemError(message: string, code: RedeemErrorBody["code"], status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Business error thrown inside the redemption transaction. `db.transaction`
 * re-throws it, so the outer catch maps it to the right HTTP status instead
 * of collapsing every failure into a generic 500.
 */
class RedeemError extends Error {
  readonly code: RedeemErrorBody["code"];
  readonly status: number;

  constructor(code: RedeemErrorBody["code"], message: string, status: number) {
    super(message);
    this.name = "RedeemError";
    this.code = code;
    this.status = status;
  }
}

/**
 * POST /api/billing/redeem-code
 * Body: { code: string }
 *
 * Strict, single-use activation-code redemption:
 *   1. the code must exist            -> KOD_INVALID
 *   2. it must not be redeemed yet    -> KOD_USED
 *   3. `expires_at` must be in the future -> KOD_EXPIRED
 *
 * Plan codes extend `plan_expires_at`; credit codes top up the matching
 * balance, extend its 30-day window and write the `store_credits` ledger row.
 * All operations wrapped in a single atomic transaction.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Free-growth mode: codes are not redeemable while everything is free.
    if (isFreeMode()) {
      return redeemError(
        "All features are currently free — no activation code is needed.",
        "FREE_MODE",
        403
      );
    }

    const body = await request.json().catch(() => null);
    const validation = validateRequest(redeemCodeSchema, body);
    if (!validation.success) {
      return redeemError(formatZodError(validation.error), "KOD_INVALID", 400);
    }
    const code = validation.data.code;

    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (storeRows.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const storeId = storeRows[0].id;

    // Perform all operations in a single atomic transaction
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, code))
        .limit(1);

      const record = rows[0];
      if (!record) {
        throw new RedeemError("KOD_INVALID", "Invalid activation code", 400);
      }
      if (record.isUsed) {
        throw new RedeemError("KOD_USED", "This activation code has already been used", 409);
      }
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
        throw new RedeemError("KOD_EXPIRED", "This activation code has expired", 410);
      }
      if (!isActivationCodeType(record.type)) {
        throw new RedeemError("KOD_INVALID", "Invalid activation code", 400);
      }

      // Atomically claim the code so it can never be redeemed twice, even by
      // concurrent requests.
      const claimed = await tx
        .update(activationCodes)
        .set({
          isUsed: true,
          usedByStoreId: storeId,
          usedAt: new Date(),
        })
        .where(
          and(eq(activationCodes.id, record.id), eq(activationCodes.isUsed, false))
        )
        .returning({ id: activationCodes.id });

      if (claimed.length === 0) {
        throw new RedeemError("KOD_USED", "This activation code has already been used", 409);
      }

      const spec = activationCodeSpec(record.type);

      if (spec.kind === "credit" && (!spec.creditType || !spec.creditAmount)) {
        throw new RedeemError("KOD_INVALID", "Invalid activation code", 400);
      }

      if (spec.kind === "plan") {
        const planExpiresAt =
          spec.grantsPlan === "free"
            ? null
            : sql`GREATEST(COALESCE(${stores.planExpiresAt}, now()), now()) + make_interval(days => ${spec.planDays})`;

        await tx
          .update(stores)
          .set({ plan: spec.grantsPlan, planExpiresAt })
          .where(eq(stores.id, storeId));
      } else {
        const balance = await grantCredits(
          storeId,
          spec.creditType ?? "ai",
          spec.creditAmount ?? 0,
          `Redeemed activation code ${code} (${spec.label})`,
          { extendExpiryDays: CREDIT_VALIDITY_DAYS }
        );
        if (balance === null) {
          throw new PaywallError(
            "PAYMENT_REQUIRED",
            "Credits system is not available. Run the billing migrations.",
            500
          );
        }
      }

      return { record, spec };
    });

    const { record, spec } = result;
    const billing = await buildBillingInfo(session.id);

    return NextResponse.json({
      success: true,
      code: record.code,
      type: record.type,
      granted: {
        kind: spec.kind,
        plan: spec.kind === "plan" ? spec.grantsPlan : null,
        planDays: spec.kind === "plan" ? spec.planDays : null,
        creditType: spec.creditType,
        credits: spec.creditAmount,
        validityDays: spec.kind === "credit" ? CREDIT_VALIDITY_DAYS : null,
      },
      billing,
    });
  } catch (error) {
    if (error instanceof RedeemError) {
      return redeemError(error.message, error.code, error.status);
    }
    if (error instanceof PaywallError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Redeem code error:", error);
    return createErrorResponse(error, "Failed to redeem activation code");
  }
}

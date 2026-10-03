import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { activationCodes, storeAddOns, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { buildBillingInfo } from "@/lib/billing";
import { createErrorResponse } from "@/lib/errors";
import {
  activationCodeSpec,
  isActivationCodeType,
  type ActivationCodeType,
} from "@/lib/billing-packages";
import { PaywallError, upsertAddOn } from "@/lib/paywall";
import { validateRequest, activateAddonSchema, formatZodError } from "@/lib/validators";

export const runtime = "nodejs";

interface ActivateAddonErrorBody {
  error: string;
  code: "KOD_INVALID" | "KOD_USED" | "KOD_EXPIRED" | "KOD_MISMATCH" | string;
}

function activateAddonError(message: string, code: ActivateAddonErrorBody["code"], status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * POST /api/billing/activate-addon
 * Body: { code: string, addOn: "white_label" | "staff_seats" }
 *
 * Validates and redeems an activation code for a specific add-on.
 * The voucher type must match the requested add-on:
 *   - REMOVE_BRANDING -> white_label
 *   - STAFF_SEAT -> staff_seats
 *
 * On success: marks voucher as used, activates the add-on for 30 days,
 * returns updated billing info.
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

    const body = await request.json().catch(() => null);
    const validation = validateRequest(activateAddonSchema, body);
    if (!validation.success) {
      return activateAddonError(formatZodError(validation.error), "KOD_INVALID", 400);
    }
    const { code, addOn } = validation.data;

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

    // Map add-on to expected voucher type
    const expectedVoucherType: Record<string, ActivationCodeType> = {
      white_label: "REMOVE_BRANDING",
      staff_seats: "STAFF_SEAT",
    };

    const expectedType = expectedVoucherType[addOn];
    if (!expectedType) {
      return activateAddonError("Invalid add-on", "KOD_INVALID", 400);
    }

    // Perform all operations in a single atomic transaction
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, code))
        .limit(1);

      const record = rows[0];
      if (!record) {
        throw new Error("KOD_INVALID:Invalid activation code");
      }
      if (record.isUsed) {
        throw new Error("KOD_USED:This activation code has already been used");
      }
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
        throw new Error("KOD_EXPIRED:This activation code has expired");
      }
      if (!isActivationCodeType(record.type)) {
        throw new Error("KOD_INVALID:Invalid activation code");
      }

      // Verify voucher type matches the requested add-on
      if (record.type !== expectedType) {
        throw new Error("KOD_MISMATCH:This code is not valid for the selected add-on");
      }

      // Atomically claim the code so it can never be redeemed twice
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
        throw new Error("KOD_USED:This activation code has already been used");
      }

      const spec = activationCodeSpec(record.type);

      // Activate the add-on for the specified duration
      const expiresAt = sql`GREATEST(COALESCE(${storeAddOns.updatedAt}, now()), now()) + make_interval(days => ${spec.planDays})`;

      await upsertAddOn(storeId, addOn as "white_label" | "staff_seats", 1, spec.price, true);

      // For staff_seats, also update the maxStaffSeats on the store
      if (addOn === "staff_seats") {
        await tx
          .update(stores)
          .set({ maxStaffSeats: sql`${stores.maxStaffSeats} + 1` })
          .where(eq(stores.id, storeId));
      }

      // For white_label, set hasWhiteLabel flag
      if (addOn === "white_label") {
        await tx
          .update(stores)
          .set({ hasWhiteLabel: true })
          .where(eq(stores.id, storeId));
      }

      return { record, spec };
    });

    if (result instanceof Error) {
      const [errCode, message] = result.message.split(":", 2);
      return activateAddonError(
        message,
        errCode as ActivateAddonErrorBody["code"],
        errCode === "KOD_INVALID" ? 400 :
        errCode === "KOD_USED" ? 409 :
        errCode === "KOD_EXPIRED" ? 410 :
        errCode === "KOD_MISMATCH" ? 400 : 400
      );
    }

    const { record, spec } = result;
    const billing = await buildBillingInfo(session.id);

    return NextResponse.json({
      success: true,
      code: record.code,
      type: record.type,
      addOn,
      granted: {
        kind: "addon",
        addOn,
        validityDays: spec.planDays,
      },
      billing,
    });
  } catch (error) {
    if (error instanceof PaywallError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Activate add-on error:", error);
    return createErrorResponse(error, "Failed to activate add-on");
  }
}
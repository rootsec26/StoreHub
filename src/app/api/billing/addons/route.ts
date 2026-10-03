import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  clampExtraStaffSeats,
  INCLUDED_STAFF_SEATS,
  STAFF_SEAT_PRICE,
  WHITE_LABEL_PRICE,
} from "@/lib/billing-packages";
import {
  getStoreEntitlements,
  PaywallError,
  upsertAddOn,
  type AddOnFeature,
} from "@/lib/paywall";

export const runtime = "nodejs";

function isAddOn(value: unknown): value is AddOnFeature {
  return value === "white_label" || value === "staff_seats";
}

/**
 * POST /api/billing/add-ons
 * Toggles a monthly add-on (mock billing: no payment provider attached).
 *
 * Body:
 *   { addOn: "white_label", enabled: boolean }
 *   { addOn: "staff_seats", quantity: number }   // extra seats beyond the free one
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
    const addOn = body?.addOn;

    if (!isAddOn(addOn)) {
      return NextResponse.json(
        { error: "Invalid add-on", code: "INVALID_ADD_ON" },
        { status: 400 }
      );
    }

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const storeId = store[0].id;

    if (addOn === "white_label") {
      const enabled = body?.enabled === true;
      await db
        .update(stores)
        .set({ hasWhiteLabel: enabled })
        .where(eq(stores.id, storeId));
      await upsertAddOn(
        storeId,
        "white_label",
        1,
        WHITE_LABEL_PRICE,
        enabled
      );

      const entitlements = await getStoreEntitlements(storeId);
      return NextResponse.json({
        addOn,
        enabled,
        monthlyPrice: enabled ? WHITE_LABEL_PRICE : 0,
        hasWhiteLabel: entitlements?.hasWhiteLabel ?? enabled,
        maxStaffSeats: entitlements?.maxStaffSeats ?? INCLUDED_STAFF_SEATS,
        whatsappCredits: entitlements?.whatsappCredits ?? 0,
        aiCredits: entitlements?.aiCredits ?? 0,
      });
    }

    const rawQuantity = typeof body?.quantity === "number" ? body.quantity : 0;
    const extraSeats = clampExtraStaffSeats(rawQuantity);

    await db
      .update(stores)
      .set({ maxStaffSeats: INCLUDED_STAFF_SEATS + extraSeats })
      .where(eq(stores.id, storeId));
    await upsertAddOn(
      storeId,
      "staff_seats",
      extraSeats,
      STAFF_SEAT_PRICE,
      extraSeats > 0
    );

    const entitlements = await getStoreEntitlements(storeId);
    return NextResponse.json({
      addOn,
      quantity: extraSeats,
      monthlyPrice: extraSeats * STAFF_SEAT_PRICE,
      maxStaffSeats: entitlements?.maxStaffSeats ?? INCLUDED_STAFF_SEATS + extraSeats,
      hasWhiteLabel: entitlements?.hasWhiteLabel ?? false,
      aiCredits: entitlements?.aiCredits ?? 0,
      whatsappCredits: entitlements?.whatsappCredits ?? 0,
    });
  } catch (error) {
    if (error instanceof PaywallError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Add-on update error:", error);
    return createErrorResponse(error, "Failed to update add-on");
  }
}

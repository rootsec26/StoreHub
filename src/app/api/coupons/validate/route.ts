import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateCoupon } from "@/lib/coupons";
import { createErrorResponse } from "@/lib/errors";

// Public: preview a coupon against the current cart before checkout.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, code, subtotal } = body ?? {};

    const amount = Number(subtotal);
    if (!storeId || !code || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json(
        { error: "storeId, code and subtotal are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const result = await validateCoupon({
      storeId,
      code,
      subtotal: amount,
    });

    if (!result.ok) {
      return NextResponse.json(
        { valid: false, error: result.message, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.coupon.code,
      discountAmount: result.discountAmount.toFixed(2),
    });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return createErrorResponse(error, "Failed to validate coupon");
  }
}

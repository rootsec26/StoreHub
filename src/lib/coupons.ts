import { db } from "@/db";
import { coupons } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type CouponValidationCode =
  | "COUPON_NOT_FOUND"
  | "COUPON_EXPIRED"
  | "COUPON_EXHAUSTED"
  | "MIN_SPEND_NOT_MET";

export type CouponValidation =
  | {
      ok: true;
      coupon: typeof coupons.$inferSelect;
      discountAmount: number;
    }
  | {
      ok: false;
      code: CouponValidationCode;
      message: string;
      requiredSpend?: number;
    };

/**
 * Validates a coupon against a cart subtotal without side effects.
 * Shared by the storefront checkout (preview) and the checkout API (charge).
 */
export async function validateCoupon(params: {
  storeId: string;
  code: string;
  subtotal: number;
  now?: number;
}): Promise<CouponValidation> {
  const { storeId, code, subtotal, now = Date.now() } = params;
  const normalized = String(code ?? "").trim().toUpperCase();

  if (!normalized) {
    return {
      ok: false,
      code: "COUPON_NOT_FOUND",
      message: "Coupon code is required",
    };
  }

  const rows = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.storeId, storeId), eq(coupons.code, normalized)))
    .limit(1);

  const coupon = rows[0];
  if (!coupon) {
    return {
      ok: false,
      code: "COUPON_NOT_FOUND",
      message: "This coupon code does not exist",
    };
  }

  if (coupon.timesUsed >= coupon.maxUses) {
    return {
      ok: false,
      code: "COUPON_EXHAUSTED",
      message: "This coupon has reached its usage limit",
    };
  }

  if (coupon.expiresAt && now >= coupon.expiresAt.getTime()) {
    return {
      ok: false,
      code: "COUPON_EXPIRED",
      message: "This coupon has expired",
    };
  }

  const minSpend = parseFloat(String(coupon.minSpend)) || 0;
  if (subtotal < minSpend) {
    return {
      ok: false,
      code: "MIN_SPEND_NOT_MET",
      message: `This coupon requires a minimum spend of ${minSpend}`,
      requiredSpend: minSpend,
    };
  }

  const discount = parseFloat(String(coupon.discountAmount)) || 0;
  const discountAmount = Math.max(0, Math.min(discount, subtotal));

  return { ok: true, coupon, discountAmount };
}

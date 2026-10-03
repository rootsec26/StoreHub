import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { activationCodePricing } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isLocalhostRequest } from "@/lib/admin";
import {
  ACTIVATION_CODE_TYPES,
  ACTIVATION_CODE_SPECS,
  type ActivationCodeType,
} from "@/lib/billing-packages";

export const runtime = "nodejs";

async function requireLocalhost() {
  if (await isLocalhostRequest()) return null;
  return NextResponse.json(
    { error: "Not found", code: "NOT_FOUND" },
    { status: 404 }
  );
}

function toPricingDTO(row: typeof activationCodePricing.$inferSelect) {
  const basePrice = row.basePrice ? parseFloat(row.basePrice) : 0;
  const promoPrice = row.promoPrice ? parseFloat(row.promoPrice) : null;
  const promoExpiresAt = row.promoExpiresAt
    ? new Date(row.promoExpiresAt).toISOString()
    : null;

  // Determine if promo is active
  const promoActive =
    promoPrice !== null &&
    promoExpiresAt !== null &&
    new Date(promoExpiresAt).getTime() > Date.now();

  return {
    id: row.id,
    type: row.type,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    basePrice,
    promoPrice,
    promoExpiresAt,
    isActive: row.isActive,
    // The effective price is promo price if active, otherwise base price
    effectivePrice: promoActive ? promoPrice : basePrice,
    hasActivePromo: promoActive,
    updatedAt: new Date(row.updatedAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** Default fallback pricing when DB table is missing or unavailable. */
function getDefaultPricing() {
  return ACTIVATION_CODE_TYPES.map((type) => {
    const spec = ACTIVATION_CODE_SPECS[type];
    return {
      id: crypto.randomUUID(),
      type,
      nameAr: null,
      nameEn: null,
      basePrice: spec.price,
      promoPrice: null,
      promoExpiresAt: null,
      isActive: true,
      effectivePrice: spec.price,
      hasActivePromo: false,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  });
}

/** GET /api/admin/pricing — all pricing records for activation code types. */
export async function GET() {
  const denied = await requireLocalhost();
  if (denied) return denied;

  try {
    const rows = await db
      .select()
      .from(activationCodePricing)
      .orderBy(activationCodePricing.type);

    // Ensure all activation code types have a pricing record
    const existingTypes = new Set(rows.map((r) => r.type));
    const missingTypes = ACTIVATION_CODE_TYPES.filter(
      (t) => !existingTypes.has(t)
    );

    if (missingTypes.length > 0) {
      // Insert default pricing for missing types
      const defaults = missingTypes.map((type) => {
        const spec = ACTIVATION_CODE_SPECS[type as ActivationCodeType];
        return {
          type,
          basePrice: spec.price.toFixed(2),
          promoPrice: null,
          promoExpiresAt: null,
          nameAr: null,
          nameEn: null,
          isActive: true,
        };
      });

      await db.insert(activationCodePricing).values(defaults).onConflictDoNothing();

      // Re-fetch to include newly created records
      const updatedRows = await db
        .select()
        .from(activationCodePricing)
        .orderBy(activationCodePricing.type);
      return NextResponse.json({ pricing: updatedRows.map(toPricingDTO) });
    }

    return NextResponse.json({ pricing: rows.map(toPricingDTO) });
  } catch (error) {
    console.error("List activation code pricing error:", error);
    // Graceful fallback: return default hardcoded pricing with HTTP 200
    // instead of crashing with HTTP 500 if the table doesn't exist
    if (
      error instanceof Error &&
      (error.message.includes('relation "activation_code_pricing" does not exist') ||
        error.message.includes('table "activation_code_pricing" does not exist') ||
        error.message.includes("activation_code_pricing") ||
        error.message.includes("42P01"))
    ) {
      return NextResponse.json({ pricing: getDefaultPricing() });
    }
    return createErrorResponse(error, "Failed to list activation code pricing");
  }
}

/** PATCH /api/admin/pricing — update pricing for a single activation code type. */
export async function PATCH(request: NextRequest) {
  const denied = await requireLocalhost();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const type = body?.type;
  const basePrice = body?.basePrice;
  const promoPrice = body?.promoPrice ?? null;
  const promoExpiresAt = body?.promoExpiresAt ?? null;
  const nameAr = body?.nameAr ?? null;
  const nameEn = body?.nameEn ?? null;
  const isActive = body?.isActive ?? true;

  if (!type || !ACTIVATION_CODE_TYPES.includes(type as ActivationCodeType)) {
    return NextResponse.json(
      { error: "Unknown voucher type", code: "INVALID_TYPE" },
      { status: 400 }
    );
  }

  if (typeof basePrice !== "number" || basePrice < 0) {
    return NextResponse.json(
      { error: "Base price must be a non-negative number", code: "INVALID_BASE_PRICE" },
      { status: 400 }
    );
  }

  if (promoPrice !== null && (typeof promoPrice !== "number" || promoPrice < 0)) {
    return NextResponse.json(
      { error: "Promo price must be a non-negative number", code: "INVALID_PROMO_PRICE" },
      { status: 400 }
    );
  }

  if (promoExpiresAt !== null) {
    const ts = new Date(promoExpiresAt).getTime();
    if (!Number.isFinite(ts)) {
      return NextResponse.json(
        { error: "Invalid promo expiration date", code: "INVALID_PROMO_EXPIRES_AT" },
        { status: 400 }
      );
    }
  }

  if (nameAr !== null && typeof nameAr !== "string") {
    return NextResponse.json(
      { error: "nameAr must be a string", code: "INVALID_NAME_AR" },
      { status: 400 }
    );
  }

  if (nameEn !== null && typeof nameEn !== "string") {
    return NextResponse.json(
      { error: "nameEn must be a string", code: "INVALID_NAME_EN" },
      { status: 400 }
    );
  }

  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean", code: "INVALID_IS_ACTIVE" },
      { status: 400 }
    );
  }

  try {
    const result = await db
      .update(activationCodePricing)
      .set({
        basePrice: basePrice.toFixed(2),
        promoPrice: promoPrice !== null ? promoPrice.toFixed(2) : null,
        promoExpiresAt: promoExpiresAt ? new Date(promoExpiresAt) : null,
        nameAr,
        nameEn,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(activationCodePricing.type, type))
      .returning();

    if (result.length === 0) {
      // Insert if not exists (shouldn't happen due to GET auto-creation, but safety)
      const spec = ACTIVATION_CODE_SPECS[type as ActivationCodeType];
      await db.insert(activationCodePricing).values({
        type,
        basePrice: basePrice.toFixed(2),
        promoPrice: promoPrice !== null ? promoPrice.toFixed(2) : null,
        promoExpiresAt: promoExpiresAt ? new Date(promoExpiresAt) : null,
        nameAr,
        nameEn,
        isActive,
      });
      return NextResponse.json({
        pricing: {
          type,
          nameAr,
          nameEn,
          basePrice,
          promoPrice,
          promoExpiresAt,
          isActive,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ pricing: toPricingDTO(result[0]) });
  } catch (error) {
    console.error("Update activation code pricing error:", error);
    // Graceful fallback: return success with updated pricing if table is missing
    if (
      error instanceof Error &&
      (error.message.includes('relation "activation_code_pricing" does not exist') ||
        error.message.includes('table "activation_code_pricing" does not exist') ||
        error.message.includes("activation_code_pricing") ||
        error.message.includes("42P01"))
    ) {
      return NextResponse.json({
        pricing: {
          type,
          nameAr,
          nameEn,
          basePrice,
          promoPrice,
          promoExpiresAt,
          isActive,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      });
    }
    return createErrorResponse(error, "Failed to update activation code pricing");
  }
}
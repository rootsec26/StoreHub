import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { activationCodePricing } from "@/db/schema";
import {
  ACTIVATION_CODE_TYPES,
  ACTIVATION_CODE_SPECS,
  type ActivationCodeType,
} from "@/lib/billing-packages";

export const runtime = "nodejs";

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
  };
}

/** GET /api/pricing — public endpoint for live pricing data. */
export async function GET() {
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

    let allRows = rows;
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
      allRows = updatedRows;
    }

    return NextResponse.json({ pricing: allRows.map(toPricingDTO) });
  } catch (error) {
    console.error("Get pricing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
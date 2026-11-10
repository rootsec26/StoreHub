import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shippingZones, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { withRateLimit, shippingQuoteRateLimiter } from "@/lib/rate-limit";
import { computeShippingQuote } from "@/lib/shipping-pricing";

/**
 * Public shipping-fee quote for the storefront checkout.
 *   GET /api/shipping/quote?slug=<store-slug>&address=<free text>
 * Returns the fee in the store's base currency plus the matched zone so the
 * client can render it with the same currency conversion it uses for prices.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, shippingQuoteRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const slug = request.nextUrl.searchParams.get("slug")?.trim() || "";
    const address = request.nextUrl.searchParams.get("address")?.trim() || "";

    if (!slug || slug.length > 80) {
      return NextResponse.json(
        { error: "Store slug is required", code: "MISSING_SLUG" },
        { status: 400 }
      );
    }
    if (address.length > 500) {
      return NextResponse.json(
        { error: "Address is too long", code: "INVALID_ADDRESS" },
        { status: 400 }
      );
    }

    const storeRows = await db
      .select({
        id: stores.id,
        currency: stores.currency,
        shippingMode: stores.shippingMode,
        shippingFlatRate: stores.shippingFlatRate,
      })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    const store = storeRows[0];
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const zones =
      store.shippingMode === "zones"
        ? await db
            .select({
              id: shippingZones.id,
              zoneName: shippingZones.zoneName,
              rate: shippingZones.rate,
              estimatedDeliveryDays: shippingZones.estimatedDeliveryDays,
              isActive: shippingZones.isActive,
            })
            .from(shippingZones)
            .where(
              and(
                eq(shippingZones.storeId, store.id),
                eq(shippingZones.isActive, true)
              )
            )
        : [];

    const quote = computeShippingQuote({
      mode: store.shippingMode,
      flatRate: store.shippingFlatRate,
      zones,
      address,
    });

    return NextResponse.json({
      mode: quote.mode,
      fee: quote.fee,
      baseRate: quote.baseRate,
      zoneName: quote.zoneName,
      zoneMatched: quote.zoneMatched,
      estimatedDays: quote.estimatedDays,
      currency: store.currency || "EGP",
    });
  } catch (error) {
    console.error("Shipping quote error:", error);
    return createErrorResponse(error, "Failed to calculate shipping fee");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { priceAlerts, products, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { getStoreBySlug } from "@/lib/storefront";
import { priceAlertRateLimiter, withRateLimit } from "@/lib/rate-limit";
import { validateAlertContact, canonicalContactValue, type AlertContactType } from "@/lib/price-alerts";

/**
 * Public guest endpoint for the "notify me if the price drops" feature.
 *
 * Request body:
 *   - storeSlug        (required)  : the store the product belongs to
 *   - productId        (required)  : the product to watch
 *   - contactRaw       (required)  : phone or email the shopper wants alerts at
 *   - baselinePrice    (required)  : the price the shopper saw when asking
 *
 * Response:
 *   - success: true/false
 *   - alert: { id, status } on success
 *   - error + code on failure
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, priceAlertRateLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const { storeSlug, productId, contactRaw, baselinePrice } = body;

    if (!storeSlug || !productId) {
      return NextResponse.json(
        { success: false, error: "Store slug and product id are required.", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const store = await getStoreBySlug(storeSlug);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found.", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid product id.", code: "INVALID_PRODUCT" },
        { status: 400 }
      );
    }

    // Validate contact first so we never touch the DB with bad input.
    const contactResult = validateAlertContact(contactRaw ?? "");
    if (typeof contactResult !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: contactResult.message,
          code: contactResult.code,
        },
        { status: 400 }
      );
    }

    const contactType = contactResult;
    const contactValue = canonicalContactValue(contactType, contactRaw ?? "");

    // Basic baseline-price sanity check (must be a non-negative number).
    if (baselinePrice === undefined || baselinePrice === null || baselinePrice === "") {
      return NextResponse.json(
        { success: false, error: "A price to compare against is required.", code: "MISSING_BASELINE_PRICE" },
        { status: 400 }
      );
    }

    const baselineNumeric = Number(baselinePrice);
    if (!Number.isFinite(baselineNumeric) || baselineNumeric < 0) {
      return NextResponse.json(
        { success: false, error: "Baseline price must be a valid non-negative number.", code: "INVALID_BASELINE_PRICE" },
        { status: 400 }
      );
    }

    // Format baseline price the same way the products table stores prices.
    const baselinePriceFormatted = String(baselineNumeric.toFixed(2));

    // Verify the product exists and belongs to this store.
    const product = await db
      .select({ id: products.id, price: products.price })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, store.id)))
      .limit(1);

    if (product.length === 0) {
      return NextResponse.json(
        { success: false, error: "Product not found in this store.", code: "PRODUCT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const existingPrice = product[0].price;
    if (existingPrice === baselinePriceFormatted) {
      // Nothing to alert on yet — the current price already matches the baseline.
      // We still create the row so the shopper can be notified on a real drop.
    }

    const [alert] = await db
      .insert(priceAlerts)
      .values({
        storeId: store.id,
        productId,
        contactType,
        contactValue,
        baselinePrice: baselinePriceFormatted,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [
          priceAlerts.storeId,
          priceAlerts.productId,
          priceAlerts.contactType,
          priceAlerts.contactValue,
        ],
      })
      .returning({ id: priceAlerts.id, status: priceAlerts.status });

    if (!alert) {
      return NextResponse.json(
        {
          success: true,
          alert: { id: null, status: "exists", existed: true },
          note: "You already have an active alert for this product with this contact.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, alert: { id: alert.id, status: alert.status } }, { status: 201 });
  } catch (error) {
    console.error("[price-alerts] POST failed:", error);
    return createErrorResponse(error, "Failed to save price alert");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { resolveStoreAccess, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { PaywallError, requireActivePlan } from "@/lib/paywall";
import { absoluteUrl } from "@/lib/site";
import { fulfillOrderBatch, MAX_FULFILL_BATCH } from "@/lib/shipping-fulfillment";

/**
 * POST /api/shipping/fulfill
 * Body: { order_ids: string[] } (alias: orderIds)
 *
 * Auto-routes every order to the right carrier for its governorate, books the
 * shipment (carrier API or mock provider), stamps tracking numbers + AWB links
 * on the orders and returns a merged printable bulk label PDF URL.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storeAccess = await resolveStoreAccess(session.id);
    const store = storeAccess ? { id: storeAccess.store.id } : undefined;
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Carrier booking is a paid-plan feature: enforce it in the handler too,
    // so API-key / token-less callers cannot reach the carrier integrations.
    try {
      await requireActivePlan(store.id);
    } catch (error) {
      if (error instanceof PaywallError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status }
        );
      }
      throw error;
    }

    const body = await request.json().catch(() => null);
    const rawIds: unknown[] = Array.isArray(body?.order_ids)
      ? body.order_ids
      : Array.isArray(body?.orderIds)
        ? body.orderIds
        : [];

    const orderIds = [
      ...new Set(
        rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      ),
    ].map((id) => id.trim());

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "At least one order ID is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (orderIds.length > MAX_FULFILL_BATCH) {
      return NextResponse.json(
        { error: `Bulk fulfillment is limited to ${MAX_FULFILL_BATCH} orders`, code: "TOO_MANY" },
        { status: 400 }
      );
    }

    const outcome = await fulfillOrderBatch({ storeId: store.id, orderIds });

    const bulkLabelUrl =
      outcome.results.length > 0
        ? absoluteUrl(
            `/api/shipping/awb?orderIds=${outcome.results
              .map((result) => result.orderId)
              .join(",")}`
          )
        : null;

    return NextResponse.json({
      results: outcome.results,
      failures: outcome.failures,
      fulfilledCount: outcome.results.length,
      failedCount: outcome.failures.length,
      bulkLabelUrl,
    });
  } catch (error) {
    console.error("Fulfill orders error:", error);
    return createErrorResponse(error, "Failed to fulfill orders");
  }
}

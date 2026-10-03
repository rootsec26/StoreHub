import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateRequest, formatZodError } from "@/lib/validators";
import { createErrorResponse } from "@/lib/errors";
import { createRateLimiter, withRateLimit } from "@/lib/rate-limit";
import {
  applyCodVerificationDecision,
  CodVerificationError,
} from "@/lib/orders/cod-verification";

const verifyCodSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  status: z.enum(["CONFIRMED", "CANCELLED"]),
  /** Optional tenant check — the storefront verify page always sends it. */
  store_slug: z.string().min(1).max(120).optional(),
});

const codVerificationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: "cod-verify",
  message: "Too many verification attempts. Please try again shortly.",
});

/**
 * POST /api/orders/verify-cod
 * `{ order_id, status: "CONFIRMED" | "CANCELLED" }`
 *
 * Called by the storefront fallback link, the WhatsApp interactive-button
 * webhook and the merchant "Resend/Confirm" actions.
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, codVerificationRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const validation = validateRequest(verifyCodSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { order_id, status, store_slug } = validation.data;

    if (store_slug) {
      const storeRow = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.slug, store_slug))
        .limit(1);

      if (storeRow.length === 0) {
        return NextResponse.json(
          { error: "Store not found", code: "STORE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const orderRow = await db
        .select({ storeId: orders.storeId })
        .from(orders)
        .where(eq(orders.id, order_id))
        .limit(1);

      if (orderRow.length === 0 || orderRow[0].storeId !== storeRow[0].id) {
        return NextResponse.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          { status: 404 }
        );
      }
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const result = await applyCodVerificationDecision({
      orderId: order_id,
      decision: status,
      ipAddress,
    });

    // Make the merchant dashboard badge flip instantly.
    revalidatePath("/dashboard/orders");

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      order: result.order,
    });
  } catch (error) {
    if (error instanceof CodVerificationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("COD verification error:", error);
    return createErrorResponse(error, "Failed to verify order");
  }
}

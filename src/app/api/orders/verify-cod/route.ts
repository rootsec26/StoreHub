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
import { verifyOrderToken } from "@/lib/order-tokens";
import { isAuthenticatedStoreOwner } from "@/lib/orders/order-access";

const verifyCodSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  status: z.enum(["CONFIRMED", "CANCELLED"]),
  /**
   * Required tenant proof — every caller (storefront verify page, WhatsApp
   * button webhook) must present a signed token bound to this order and
   * action. Authenticated store owners may call the endpoint without one.
   */
  store_slug: z.string().min(1).max(120),
  token: z.string().min(20).max(512).optional(),
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

    // Tenant scoping is mandatory: the order must belong to the store named by
    // store_slug, otherwise 404 (never confirm/cancel across tenants).
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

    // Proof of ownership: either a signed token whose purpose matches the
    // requested decision, or an authenticated session that owns the store.
    const token =
      validation.data.token ||
      request.nextUrl.searchParams.get("token") ||
      null;
    const expectedPurpose =
      status === "CONFIRMED" ? "cod_confirm" : "cod_cancel";

    if (token) {
      const payload = verifyOrderToken(token, {
        orderId: order_id,
        purpose: expectedPurpose,
      });
      if (!payload) {
        return NextResponse.json(
          {
            error: "Invalid or expired verification link",
            code: "INVALID_ORDER_TOKEN",
          },
          { status: 401 }
        );
      }
    } else if (!(await isAuthenticatedStoreOwner(storeRow[0].id))) {
      return NextResponse.json(
        {
          error: "A valid verification link or merchant session is required",
          code: "ORDER_TOKEN_REQUIRED",
        },
        { status: 401 }
      );
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
      // Minimal projection only — never expose customer PII (name/phone/
      // address/notes) to an unauthenticated verify link.
      order: {
        id: result.order.id,
        status: result.order.status,
        codVerificationStatus: result.order.codVerificationStatus,
      },
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { createRateLimiter, withRateLimit } from "@/lib/rate-limit";
import { verifyOrderToken } from "@/lib/order-tokens";
import { isAuthenticatedStoreOwner } from "@/lib/orders/order-access";

const proofSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  storeSlug: z.string().min(1).max(120),
  /** Signed token minted by /api/checkout for this order. */
  token: z.string().min(20).max(512),
  /** Compressed `data:image/...;base64,...` payload (preferred). */
  proofDataUrl: z.string().max(8_000_000).optional(),
  /** Same safe data-URL format — external http(s) proof links are rejected. */
  proofUrl: z.string().max(8_000_000).optional(),
  paymentMethodDetail: z.string().max(120).optional(),
});

/** ~6 MB of binary once base64-encoded — covers uncompressed GIF/SVG proofs. */
const MAX_PROOF_DATA_URL_LENGTH = 8_000_000;

const proofRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: "payment-proof",
  message: "Too many uploads. Please try again shortly.",
});

function isAllowedProofUrl(value: string): boolean {
  return /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(
    value
  );
}

/**
 * POST /api/orders/payment-proof
 * Buyer-facing endpoint: attaches a transfer screenshot to a manual-payment
 * order. Authorization is the signed `payment_proof` order token issued by
 * checkout (or an authenticated store owner session).
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, proofRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const validation = proofSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid payment proof payload", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { orderId, storeSlug, token, proofDataUrl, proofUrl, paymentMethodDetail } =
      validation.data;

    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, storeSlug))
      .limit(1);
    if (storeRows.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const storeId = storeRows[0].id;

    const tokenPayload = verifyOrderToken(token, {
      orderId,
      purpose: "payment_proof",
    });
    const owner = tokenPayload
      ? false
      : await isAuthenticatedStoreOwner(storeId);
    if (!tokenPayload && !owner) {
      return NextResponse.json(
        { error: "Invalid or expired upload link", code: "INVALID_ORDER_TOKEN" },
        { status: 401 }
      );
    }

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
      .limit(1);
    if (orderRows.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }
    const order = orderRows[0];

    if (order.paymentMethod !== "manual") {
      return NextResponse.json(
        { error: "This order does not accept a manual payment proof", code: "NOT_MANUAL_ORDER" },
        { status: 400 }
      );
    }

    if (order.paymentProofStatus === "APPROVED") {
      return NextResponse.json(
        { error: "Payment already approved for this order", code: "PROOF_ALREADY_APPROVED" },
        { status: 409 }
      );
    }

    const resolvedProof = proofDataUrl || proofUrl || "";
    if (!resolvedProof) {
      return NextResponse.json(
        { error: "A payment screenshot is required", code: "MISSING_PROOF" },
        { status: 400 }
      );
    }
    // Strict allowlist: only `data:image/(png|jpeg|webp|gif|avif);base64,…`
    // payloads are stored. Arbitrary external URLs are rejected so a buyer
    // cannot point the merchant dashboard at a tracking pixel or hostile host.
    if (
      resolvedProof.length > MAX_PROOF_DATA_URL_LENGTH ||
      !isAllowedProofUrl(resolvedProof)
    ) {
      return NextResponse.json(
        { error: "Invalid or too-large payment screenshot", code: "INVALID_PROOF" },
        { status: 400 }
      );
    }

    await db
      .update(orders)
      .set({
        paymentProofUrl: resolvedProof,
        paymentProofStatus: "PENDING",
        paymentProofSubmittedAt: new Date(),
        ...(paymentMethodDetail !== undefined
          ? { paymentMethodDetail: paymentMethodDetail.trim().slice(0, 120) }
          : {}),
      })
      .where(eq(orders.id, order.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Payment proof upload error:", error);
    return createErrorResponse(error, "Failed to submit payment proof");
  }
}

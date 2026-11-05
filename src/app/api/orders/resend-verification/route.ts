import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { validateRequest, formatZodError } from "@/lib/validators";
import {
  createErrorResponse,
  formatErrorForLog,
  isDatabaseUnreachable,
} from "@/lib/errors";
import { canManageOrders } from "@/lib/order-state-machine";
import { resendVerificationRateLimiter, withRateLimit } from "@/lib/rate-limit";
import {
  isCodOrder,
  triggerCodVerification,
} from "@/lib/orders/cod-verification";
import {
  PaywallError,
  sendMeteredWhatsApp,
  type MeteredSendOutcome,
} from "@/lib/paywall";
import type { CodVerificationSendResult } from "@/lib/orders/cod-verification";

const resendSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  locale: z.enum(["en", "ar"]).optional(),
});

/** Network-level failure codes raised by `fetch` / undici / Node sockets. */
const GATEWAY_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNABORTED",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * True when an error came from talking to the WhatsApp provider (DNS,
 * refused connection, reset, timeout/abort, non-2xx response) rather than
 * from our own database or validation code.
 */
function isWhatsAppGatewayError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Database failures have their own mapping (503 DATABASE_UNREACHABLE /
  // 500 …) — never relabel them as a WhatsApp gateway problem.
  if (isDatabaseUnreachable(error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && GATEWAY_ERROR_CODES.has(code)) return true;

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("getaddrinfo") ||
    message.includes("socket hang up") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("whatsapp api")
  );
}

/**
 * POST /api/orders/resend-verification
 * Merchant quick action: re-sends the WhatsApp COD verification message.
 */
export async function POST(request: NextRequest) {
  // Every call can spend a WhatsApp credit — cap the blast radius per IP.
  const rateLimitResponse = await withRateLimit(
    request,
    resendVerificationRateLimiter
  );
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageOrders(session.role)) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const userStore = await getAccessibleStores(session.id);
    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validation = validateRequest(resendSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { orderId, locale } = validation.data;
    const storeId = userStore[0].id;

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
    if (!isCodOrder(order)) {
      return NextResponse.json(
        { error: "Order does not require COD verification", code: "NOT_COD" },
        { status: 400 }
      );
    }

    const store = userStore[0];
    const waCredits = store.whatsappCredits ?? 0;
    const waExpiresAt = store.waCreditsExpiresAt
      ? new Date(store.waCreditsExpiresAt).getTime()
      : null;
    const creditsExpired = waExpiresAt !== null && waExpiresAt <= Date.now();

    if (waCredits < 1 || creditsExpired) {
      return NextResponse.json(
        {
          success: false,
          code: creditsExpired
            ? "CREDITS_EXPIRED"
            : "WHATSAPP_CREDITS_EXHAUSTED",
          error: creditsExpired
            ? "انتهت صلاحية رصيد رسائل واتساب. يرجى إعادة الشحن من صفحة الفوترة."
            : "رصيد رسائل واتساب غير كافٍ. يرجى إعادة الشحن من صفحة الفوترة.",
          creditsRemaining: waCredits,
        },
        { status: 402 }
      );
    }

    const alreadyVerified = order.codVerificationStatus === "VERIFIED";

    if (!alreadyVerified) {
      // Re-open the verification window (resend counts as a fresh attempt).
      await db
        .update(orders)
        .set({ codVerificationStatus: "PENDING_VERIFICATION" })
        .where(eq(orders.id, orderId));
    }

    // Metered dispatch: the credit is deducted atomically (with its ledger
    // row) BEFORE the provider call — no stale pre-check race, no send
    // without payment — and refunded when the provider rejects the message.
    let outcome: MeteredSendOutcome<CodVerificationSendResult | null>;
    try {
      outcome = await sendMeteredWhatsApp(
        storeId,
        "COD verification resend",
        () =>
          triggerCodVerification(orderId, {
            locale,
            origin: request.nextUrl.origin,
          })
      );
    } catch (error) {
      if (error instanceof PaywallError) {
        return NextResponse.json(
          {
            success: false,
            code: error.code,
            error: error.message,
            creditsRemaining: waCredits,
          },
          { status: 402 }
        );
      }

      // Gateway/timeout failures while calling the WhatsApp provider must be
      // surfaced as a formatted JSON error — never as an unhandled 502.
      if (isWhatsAppGatewayError(error)) {
        console.error(
          `[api/orders/resend-verification] WhatsApp gateway call failed (store ${storeId}, order ${orderId}): ${formatErrorForLog(
            error
          )}`
        );
        return NextResponse.json(
          {
            success: false,
            code: "WHATSAPP_GATEWAY_UNAVAILABLE",
            error:
              "WhatsApp provider is unreachable or timed out. Please retry in a moment.",
            alreadyVerified,
            creditsRemaining: waCredits,
            delivered: false,
          },
          { status: 503 }
        );
      }

      throw error;
    }

    const result = outcome.result;

    revalidatePath("/dashboard/orders");

    if (!outcome.delivered) {
      // The credit was refunded; surface a clean JSON failure instead of a
      // hollow 200 — and never a raw 502 Bad Gateway.
      const providerError = result?.error ?? null;

      if (!result) {
        console.error(
          `[api/orders/resend-verification] send returned no result (store ${storeId}, order ${orderId})`
        );
        return NextResponse.json(
          {
            success: false,
            code: "ORDER_NOT_FOUND",
            error: "Order disappeared before the verification message was sent",
            alreadyVerified,
            creditsRemaining: outcome.creditsRemaining,
            delivered: false,
          },
          { status: 404 }
        );
      }

      if (providerError && /phone/i.test(providerError)) {
        console.error(
          `[api/orders/resend-verification] customer phone missing for order ${orderId}`
        );
        return NextResponse.json(
          {
            success: false,
            code: "MISSING_CUSTOMER_PHONE",
            error: providerError,
            alreadyVerified,
            creditsRemaining: outcome.creditsRemaining,
            delivered: false,
          },
          { status: 400 }
        );
      }

      console.error(
        `[api/orders/resend-verification] WhatsApp provider rejected/failed (store ${storeId}, order ${orderId}):`,
        providerError ?? "unknown provider error"
      );

      return NextResponse.json(
        {
          success: false,
          code: "WHATSAPP_GATEWAY_UNAVAILABLE",
          error: "WhatsApp provider did not accept the message",
          providerError,
          alreadyVerified,
          creditsRemaining: outcome.creditsRemaining,
          delivered: false,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "تم إعادة إرسال رابط تأكيد الواتساب بنجاح",
        alreadyVerified,
        creditsRemaining: outcome.creditsRemaining,
        delivered: true,
        channel: result?.channel ?? "fallback_link",
        verifyUrl: result?.verifyUrl ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[api/orders/resend-verification] unhandled error:",
      formatErrorForLog(error)
    );
    const response = createErrorResponse(
      error,
      "Failed to resend verification message"
    );
    // This endpoint must never answer with 409 (conflict) — it would surface
    // as a hard failure for a harmless merchant quick action.
    if (response.status === 409) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to resend verification message",
        },
        { status: 500 }
      );
    }
    return response;
  }
}

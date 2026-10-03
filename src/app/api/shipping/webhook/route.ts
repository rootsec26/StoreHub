import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, shippingIntegrations } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isShippingCarrier, mapCarrierStatus } from "@/lib/shipping";
import { decryptSecret } from "@/lib/shipping-crypto";
import {
  ShippingWebhookError,
  applyCarrierStatusUpdate,
} from "@/lib/shipping-status-sync";

/**
 * POST /api/shipping/webhook — carrier status receiver.
 *
 * Payload (loosely typed on purpose, carriers differ):
 *   { "tracking_number": "BOS261003K7X9Q2", "status": "OUT_FOR_DELIVERY" }
 *
 * Optional `x-shipping-signature: sha256=<hmac>` is required when
 * SHIPPING_WEBHOOK_SECRET or the carrier integration's api_secret is set.
 *
 * On DELIVERED the order flips to Completed + Paid (revenue accrual) and the
 * buyer receives a WhatsApp delivery receipt.
 */

function pickString(payload: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    let current: unknown = payload;
    for (const key of path.split(".")) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return null;
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const [scheme, digest] = header.split("=");
  if (scheme !== "sha256" || !digest) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(digest, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function resolveWebhookSecret(
  trackingNumber: string,
  carrierHint: string | null
): Promise<string | null> {
  const envSecret = process.env.SHIPPING_WEBHOOK_SECRET;
  if (envSecret) return envSecret;

  const orderRows = await db
    .select({ storeId: orders.storeId, carrierName: orders.carrierName })
    .from(orders)
    .where(eq(orders.trackingNumber, trackingNumber))
    .limit(1);
  const order = orderRows[0];
  if (!order) return null;

  const integrations = await db
    .select()
    .from(shippingIntegrations)
    .where(eq(shippingIntegrations.storeId, order.storeId));

  const hint =
    carrierHint && isShippingCarrier(carrierHint)
      ? carrierHint
      : isShippingCarrier(order.carrierName)
        ? order.carrierName
        : null;

  const integration = hint
    ? integrations.find((entry) => entry.carrier === hint)
    : integrations.find((entry) => Boolean(entry.apiSecret));

  if (!integration) return null;
  return decryptSecret(integration.apiSecret) || null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const trackingNumber = pickString(payload, [
      "tracking_number",
      "trackingNumber",
      "tracking",
      "waybill",
      "awb",
      "awbNumber",
      "data.tracking_number",
      "data.trackingNumber",
      "shipment.trackingNumber",
    ]);
    if (!trackingNumber) {
      return NextResponse.json(
        { error: "tracking_number is required", code: "MISSING_TRACKING" },
        { status: 400 }
      );
    }

    const rawStatus = pickString(payload, [
      "status",
      "shipment_status",
      "new_status",
      "state",
      "event",
      "data.status",
      "shipment.status",
    ]);
    const status = mapCarrierStatus(rawStatus);
    if (!status) {
      return NextResponse.json(
        { error: "Unrecognised shipment status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const carrierHint = pickString(payload, ["carrier", "provider", "data.carrier"]);
    const secret = await resolveWebhookSecret(trackingNumber, carrierHint);
    if (secret) {
      const signature = request.headers.get("x-shipping-signature");
      if (!verifySignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const result = await applyCarrierStatusUpdate({
      trackingNumber,
      status,
      rawStatus,
      carrier: carrierHint,
      location: pickString(payload, ["location", "city", "data.location"]),
      eventAt: pickString(payload, ["event_at", "eventAt", "timestamp"]),
    });

    return NextResponse.json({
      received: true,
      applied: result.applied,
      delivered: result.delivered,
      orderId: result.order.id,
      orderStatus: result.order.status,
      paymentStatus: result.order.paymentStatus,
      shippingStatus: result.order.shippingStatus,
    });
  } catch (error) {
    if (error instanceof ShippingWebhookError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Shipping webhook error:", error);
    return createErrorResponse(error, "Failed to process carrier update");
  }
}

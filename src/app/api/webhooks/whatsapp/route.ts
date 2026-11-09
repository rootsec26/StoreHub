import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import {
  applyCodVerificationDecision,
  CodVerificationError,
  parseCodReplyId,
} from "@/lib/orders/cod-verification";
import { verifyOrderToken } from "@/lib/order-tokens";
import { isValidOrderId, normalizePhoneDigits } from "@/lib/order-tracking";
import { isCodOrder } from "@/lib/orders/cod-shared";

/**
 * WhatsApp Cloud API webhook.
 *
 * Handles the two interactive buttons sent by the COD verification engine:
 * `COD_CONFIRM_<orderId>` / `COD_CANCEL_<orderId>`.
 *
 * Configuration:
 *   WHATSAPP_VERIFY_TOKEN   – token echoed back on the GET subscription check
 *   WHATSAPP_APP_SECRET     – used to validate X-Hub-Signature-256 (required)
 */

interface WebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
  };
}

interface WebhookChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: WebhookMessage[];
}

function phonesMatch(left: string, right: string): boolean {
  const a = normalizePhoneDigits(left);
  const b = normalizePhoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // WhatsApp sends the full international number while orders may store the
  // local form (e.g. 201012345678 vs 01012345678). Compare the shorter suffix
  // only when it is long enough to be meaningful.
  const minLength = Math.min(a.length, b.length);
  if (minLength < 7) return false;
  return a.endsWith(b) || b.endsWith(a);
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const [scheme, digest] = signatureHeader.split("=");
  if (scheme !== "sha256" || !digest) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(digest, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** GET – Meta subscription verification handshake. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/** POST – interactive button replies (Confirm / Cancel COD order). */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { error: "WhatsApp webhook is not configured" },
      { status: 501 }
    );
  }

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    entry?: Array<{
      changes?: Array<{ value?: WebhookChangeValue }>;
    }>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const expectedPhoneNumberId = (
    process.env.WHATSAPP_PHONE_NUMBER_ID || ""
  ).trim();

  let applied = 0;
  const restockedStoreIds = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const receivedPhoneNumberId = value.metadata?.phone_number_id || "";
      if (
        expectedPhoneNumberId &&
        receivedPhoneNumberId &&
        receivedPhoneNumberId !== expectedPhoneNumberId
      ) {
        console.warn(
          `WhatsApp COD reply ignored: received phone number ${receivedPhoneNumberId} does not belong to this deployment`
        );
        continue;
      }

      for (const message of value.messages ?? []) {
        if (
          message.type !== "interactive" ||
          message.interactive?.type !== "button_reply"
        ) {
          continue;
        }
        const replyId = message.interactive.button_reply?.id;
        if (!replyId) continue;

        const parsed = parseCodReplyId(replyId);
        if (!parsed || !isValidOrderId(parsed.orderId)) continue;

        const expectedPurpose =
          parsed.decision === "CONFIRMED" ? "cod_confirm" : "cod_cancel";

        // Reject replies whose embedded token is missing, expired or was
        // minted for a different action/order.
        if (
          !verifyOrderToken(parsed.token, {
            orderId: parsed.orderId,
            purpose: expectedPurpose,
          })
        ) {
          console.warn("WhatsApp COD reply ignored: invalid or expired token");
          continue;
        }

        const orderRows = await db
          .select({
            storeId: orders.storeId,
            customerPhone: orders.customerPhone,
            status: orders.status,
            paymentMethod: orders.paymentMethod,
            codVerificationStatus: orders.codVerificationStatus,
          })
          .from(orders)
          .where(eq(orders.id, parsed.orderId))
          .limit(1);

        const order = orderRows[0];
        if (!order) {
          console.warn("WhatsApp COD reply ignored: order not found");
          continue;
        }

        // Bind the decision to the phone that received the message.
        if (!phonesMatch(message.from || "", order.customerPhone || "")) {
          console.warn(
            "WhatsApp COD reply ignored: sender does not match the order phone"
          );
          continue;
        }

        if (!isCodOrder(order)) {
          console.warn("WhatsApp COD reply ignored: order is not COD");
          continue;
        }

        if (order.codVerificationStatus !== "PENDING_VERIFICATION") {
          console.warn(
            "WhatsApp COD reply ignored: verification is not pending"
          );
          continue;
        }

        try {
          const result = await applyCodVerificationDecision({
            orderId: parsed.orderId,
            decision: parsed.decision,
            ipAddress: "whatsapp-webhook",
          });
          if (result.changed) {
            applied += 1;
            if (parsed.decision === "CANCELLED") {
              restockedStoreIds.add(result.storeId);
            }
          }
        } catch (error) {
          if (error instanceof CodVerificationError) {
            console.warn(`WhatsApp COD reply ignored (${error.code})`);
            continue;
          }
          console.error("WhatsApp COD webhook error:", error);
        }
      }
    }
  }

  if (applied > 0) {
    revalidatePath("/dashboard/orders");
  }

  // A WhatsApp "Cancel" restocks inventory — refresh those storefronts so
  // the product badge flips back to purchasable without waiting for ISR.
  if (restockedStoreIds.size > 0) {
    try {
      const slugRows = await db
        .select({ slug: stores.slug })
        .from(stores)
        .where(inArray(stores.id, [...restockedStoreIds]));
      for (const row of slugRows) {
        revalidatePath(`/store/${row.slug}`, "layout");
      }
    } catch (error) {
      console.warn(
        "Storefront revalidation after WhatsApp COD decision failed:",
        error
      );
    }
  }

  // Always 200 so Meta does not retry the delivery.
  return NextResponse.json({ received: true, applied });
}

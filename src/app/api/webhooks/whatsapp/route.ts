import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import {
  applyCodVerificationDecision,
  CodVerificationError,
  parseCodReplyId,
} from "@/lib/orders/cod-verification";

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
  type?: string;
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
  };
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
      changes?: Array<{ value?: { messages?: WebhookMessage[] } }>;
    }>;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const messages =
    payload.entry?.flatMap(
      (entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []
    ) ?? [];

  let applied = 0;
  for (const message of messages) {
    if (message.type !== "interactive" || message.interactive?.type !== "button_reply") {
      continue;
    }
    const replyId = message.interactive.button_reply?.id;
    if (!replyId) continue;

    const parsed = parseCodReplyId(replyId);
    if (!parsed) continue;

    try {
      const result = await applyCodVerificationDecision({
        orderId: parsed.orderId,
        decision: parsed.decision,
        ipAddress: "whatsapp-webhook",
      });
      if (result.changed) applied += 1;
    } catch (error) {
      if (error instanceof CodVerificationError) {
        console.warn(`WhatsApp COD reply ignored (${error.code})`);
        continue;
      }
      console.error("WhatsApp COD webhook error:", error);
    }
  }

  if (applied > 0) {
    revalidatePath("/dashboard/orders");
  }

  // Always 200 so Meta does not retry the delivery.
  return NextResponse.json({ received: true, applied });
}

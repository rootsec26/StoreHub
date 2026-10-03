import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  isSocialPlatform,
  socialChannels,
  stores,
  type SocialPlatform,
} from "@/db/schema";
import { decryptSocialSecret, hashPageId } from "@/lib/social-crypto";
import {
  COMMENT_REPLY_TEXT,
  replyToComment,
  sendSocialText,
} from "@/lib/social-graph";
import {
  listTopProducts,
  runSocialSalesBot,
  searchProducts,
} from "@/lib/ai/social-sales-bot";

export const runtime = "nodejs";

/**
 * Social webhook handler for Facebook Pages, Instagram and WhatsApp.
 *
 *   GET  /api/webhooks/social  – Meta hub.verify_token handshake
 *   POST /api/webhooks/social  – routes incoming events:
 *        • Comment  -> public "تم الرد في الخاص 📥" reply + product DM
 *        • Message  -> src/lib/ai/social-sales-bot (tools executed) + reply
 *
 * Configuration:
 *   SOCIAL_WEBHOOK_VERIFY_TOKEN – echoed back on the GET subscription check
 *   SOCIAL_APP_SECRET           – validates X-Hub-Signature-256 (optional;
 *                                 when unset the endpoint accepts payloads,
 *                                 which keeps local simulation working)
 */

const MAX_EVENTS_PER_PAYLOAD = 20;
const DEFAULT_COMMENT_REPLY = COMMENT_REPLY_TEXT;

// ---------------------------------------------------------------------------
// Payload parsing -> normalized events
// ---------------------------------------------------------------------------

interface SocialEvent {
  kind: "message" | "comment";
  platform: SocialPlatform;
  pageId: string;
  senderId: string;
  senderName: string;
  text: string;
  commentId: string;
  productId: string;
  storeId: string;
}

interface RawPayload {
  simulation?: boolean;
  object?: string;
  entry?: unknown[];
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pushEvent(list: SocialEvent[], event: Partial<SocialEvent> & { kind: SocialEvent["kind"] }) {
  if (list.length >= MAX_EVENTS_PER_PAYLOAD) return;
  if (!event.senderId && !event.storeId) return;

  list.push({
    platform: event.platform ?? "FACEBOOK",
    pageId: event.pageId ?? "",
    senderId: event.senderId ?? "",
    senderName: event.senderName ?? "",
    text: (event.text ?? "").slice(0, 4000),
    commentId: event.commentId ?? "",
    productId: event.productId ?? "",
    storeId: event.storeId ?? "",
    kind: event.kind,
  });
}

/** Test/simulation payload: `{"simulation": true, ...}`. */
function parseSimulation(payload: RawPayload, list: SocialEvent[]): boolean {
  if (payload.simulation !== true) return false;

  const kind = payload.type === "comment" ? "comment" : "message";
  const platformRaw = asString(payload.platform).toUpperCase();
  const platform = isSocialPlatform(platformRaw) ? platformRaw : "FACEBOOK";

  pushEvent(list, {
    kind,
    platform,
    pageId: asString(payload.pageId),
    senderId: asString(payload.senderId) || asString(payload.customerRef),
    senderName: asString(payload.senderName),
    text: asString(payload.text) || asString(payload.comment),
    commentId: asString(payload.commentId),
    productId: asString(payload.productId),
    storeId: asString(payload.storeId),
  });
  return true;
}

/** Facebook Page / Instagram subscription payloads. */
function parseFacebookLike(payload: RawPayload, list: SocialEvent[]): void {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const rawEntry of entries) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const pageId = asString(entry.id);

    // Page inbox / Messenger + Instagram Direct messages.
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const rawItem of messaging) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const message = asRecord(item.message);
      const sender = asRecord(item.sender);
      if (!message || !sender) continue;
      if (message.is_echo || asRecord(message.quick_reply)) continue;
      const text = asString(message.text);
      if (!text) continue;

      pushEvent(list, {
        kind: "message",
        platform: "FACEBOOK",
        pageId,
        senderId: asString(sender.id),
        senderName: asString(sender.name),
        text,
      });
    }

    // changes[] carries Instagram comments / feed comments / IG messages.
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const rawChange of changes) {
      const change = asRecord(rawChange);
      const value = asRecord(change?.value);
      if (!value) continue;
      const field = asString(change?.field);

      const commentId = asString(value.comment_id);
      const commentText = asString(value.text);
      const from = asRecord(value.from);
      const senderId =
        asString(value.from_id) || asString(from?.id) || asString(value.username);
      const senderName = asString(from?.username) || asString(from?.name) || asString(value.username);
      const isComment =
        field === "comments" || field === "feed" || Boolean(commentId) || value.verb === "add";

      if (isComment && commentText) {
        pushEvent(list, {
          kind: "comment",
          platform: field === "comments" || commentId ? "INSTAGRAM" : "FACEBOOK",
          pageId,
          senderId,
          senderName,
          text: commentText,
          commentId,
          productId: asString(value.product_id),
        });
        continue;
      }

      // Instagram Direct message inside a changes envelope.
      const message = asRecord(value.message);
      const messageText = asString(message?.text) || asString(value.text);
      if ((field === "messages" || message) && messageText && senderId) {
        pushEvent(list, {
          kind: "message",
          platform: "INSTAGRAM",
          pageId,
          senderId,
          senderName,
          text: messageText,
        });
      }
    }
  }
}

/** WhatsApp Cloud API payloads. */
function parseWhatsApp(payload: RawPayload, list: SocialEvent[]): void {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const rawEntry of entries) {
    const entry = asRecord(rawEntry);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const rawChange of changes) {
      const value = asRecord(asRecord(rawChange)?.value);
      if (!value) continue;

      const phoneNumberId = asString(asRecord(value.metadata)?.phone_number_id);
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const profileName =
        contacts.length > 0
          ? asString(asRecord(asRecord(contacts[0])?.profile)?.name)
          : "";

      for (const rawMessage of messages) {
        const message = asRecord(rawMessage);
        const text = asString(asRecord(message?.text)?.body);
        if (!message || !text) continue;

        pushEvent(list, {
          kind: "message",
          platform: "WHATSAPP",
          pageId: phoneNumberId,
          senderId: asString(message.from),
          senderName: profileName,
          text,
        });
      }
    }
  }
}

function parseEvents(payload: RawPayload): SocialEvent[] {
  const events: SocialEvent[] = [];
  if (parseSimulation(payload, events)) return events;
  parseFacebookLike(payload, events);
  parseWhatsApp(payload, events);
  return events;
}

// ---------------------------------------------------------------------------
// Channel / store resolution
// ---------------------------------------------------------------------------

interface ResolvedChannel {
  storeId: string;
  storeName: string;
  currency: string;
  platform: SocialPlatform;
  accessToken: string;
  pageId: string;
  isAutoReplyEnabled: boolean;
  aiPersonaPrompt: string;
}

const EMPTY_CHANNEL = (
  storeId: string,
  storeName: string,
  currency: string,
  platform: SocialPlatform
): ResolvedChannel => ({
  storeId,
  storeName,
  currency,
  platform,
  accessToken: "",
  pageId: "",
  isAutoReplyEnabled: true,
  aiPersonaPrompt: "",
});

async function resolveChannel(event: SocialEvent): Promise<ResolvedChannel | null> {
  // 1. Explicit store (simulation payloads, or a channelless store).
  if (event.storeId) {
    const storeRows = await db
      .select({
        id: stores.id,
        name: stores.name,
        currency: stores.currency,
      })
      .from(stores)
      .where(eq(stores.id, event.storeId))
      .limit(1);
    if (storeRows.length === 0) return null;

    const store = storeRows[0];
    const channels = await db
      .select()
      .from(socialChannels)
      .where(eq(socialChannels.storeId, store.id))
      .limit(10);
    const match = channels.find((row) => row.platform === event.platform);

    return {
      storeId: store.id,
      storeName: store.name,
      currency: store.currency ?? "EGP",
      platform: event.platform,
      accessToken: match ? decryptSocialSecret(match.accessToken) : "",
      pageId: match ? decryptSocialSecret(match.pageId) : event.pageId,
      isAutoReplyEnabled: match ? match.isAutoReplyEnabled !== false : true,
      aiPersonaPrompt: match?.aiPersonaPrompt ?? "",
    };
  }

  // 2. Route by page id / phone-number id hash.
  const pageKey = hashPageId(event.pageId);
  if (!pageKey) return null;

  const channelRows = await db
    .select()
    .from(socialChannels)
    .where(eq(socialChannels.pageKey, pageKey))
    .limit(5);
  if (channelRows.length === 0) return null;

  const channel =
    channelRows.find((row) => row.platform === event.platform) ?? channelRows[0];

  const storeRows = await db
    .select({ id: stores.id, name: stores.name, currency: stores.currency })
    .from(stores)
    .where(eq(stores.id, channel.storeId))
    .limit(1);
  if (storeRows.length === 0) return null;

  const store = storeRows[0];
  return {
    storeId: store.id,
    storeName: store.name,
    currency: store.currency ?? "EGP",
    platform: channel.platform as SocialPlatform,
    accessToken: decryptSocialSecret(channel.accessToken),
    pageId: decryptSocialSecret(channel.pageId),
    isAutoReplyEnabled: channel.isAutoReplyEnabled !== false,
    aiPersonaPrompt: channel.aiPersonaPrompt ?? "",
  };
}

// ---------------------------------------------------------------------------
// Comment -> public reply + product DM
// ---------------------------------------------------------------------------

async function buildCommentDm(
  channel: ResolvedChannel,
  event: SocialEvent
): Promise<string> {
  let lines: string[] = [];

  if (event.productId) {
    const hits = await searchProducts(channel.storeId, event.productId, 1);
    if (hits.length > 0) {
      lines = hits.map(
        (hit) =>
          `• ${hit.name} — ${hit.price} ${channel.currency} ${
            hit.inStock ? `(متاح، ${hit.stock} قطعة)` : "(نفد المخزون)"
          }`
      );
    }
  }

  if (lines.length === 0 && event.text) {
    const hits = await searchProducts(channel.storeId, event.text, 3);
    lines = hits.map(
      (hit) =>
        `• ${hit.name} — ${hit.price} ${channel.currency} ${
          hit.inStock ? `(متاح، ${hit.stock} قطعة)` : "(نفد المخزون)"
        }`
    );
  }

  if (lines.length === 0) {
    const top = await listTopProducts(channel.storeId, 3);
    lines = top.map(
      (hit) =>
        `• ${hit.name} — ${hit.price} ${channel.currency} ${
          hit.inStock ? `(متاح، ${hit.stock} قطعة)` : "(نفد المخزون)"
        }`
    );
  }

  const greeting = event.senderName
    ? `أهلاً ${event.senderName} 👋`
    : "أهلاً وسهلاً 👋";

  const detailBlock = lines.length
    ? `التفاصيل اللي سألت عنها:\n${lines.join("\n")}\n\nابعتلي: اسمك، رقم تليفونك، والمحافظة وهجهّزلك الطلب من هنا.`
    : "ابعتلي اسم المنتج اللي عايزه وأقولك السعر والمتاح فورًا، وسجّلك الطلب من المحادثة مباشرة.";

  const commentQuote = event.text ? `\nتعليقك: «${event.text.slice(0, 200)}»\n` : "";

  return `${greeting}${commentQuote}\n${detailBlock}`;
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

interface EventResult {
  kind: SocialEvent["kind"];
  platform: SocialPlatform;
  status: "handled" | "skipped" | "ignored";
  reason?: string;
  publicReply?: string;
  dm?: string;
  reply?: string;
  source?: string;
  orderId?: string;
  delivery?: string;
}

async function handleEvent(event: SocialEvent, origin: string): Promise<EventResult> {
  const base = { kind: event.kind, platform: event.platform } as const;

  const channel = await resolveChannel(event);
  if (!channel) return { ...base, status: "ignored", reason: "NO_CHANNEL" };

  if (!channel.isAutoReplyEnabled) {
    return { ...base, status: "skipped", reason: "AUTO_REPLY_DISABLED" };
  }

  if (event.kind === "comment") {
    // 1) Public reply that pushes the customer to the DM thread.
    const publicReply = await replyToComment({
      accessToken: channel.accessToken,
      commentId: event.commentId,
      text: DEFAULT_COMMENT_REPLY,
    });

    // 2) Private DM carrying the product details.
    const dmText = await buildCommentDm(channel, event);
    const dmDelivery = await sendSocialText({
      platform: channel.platform,
      accessToken: channel.accessToken,
      recipientId: event.senderId,
      pageId: channel.pageId,
      text: dmText,
    });

    return {
      ...base,
      status: "handled",
      publicReply: DEFAULT_COMMENT_REPLY,
      dm: dmText,
      delivery: [
        publicReply.delivered ? "comment:delivered" : `comment:${publicReply.skipped ?? publicReply.error ?? "failed"}`,
        dmDelivery.delivered ? "dm:delivered" : `dm:${dmDelivery.skipped ?? dmDelivery.error ?? "failed"}`,
      ].join(","),
    };
  }

  // Direct message -> AI sales assistant with live tools.
  const bot = await runSocialSalesBot({
    storeId: channel.storeId,
    platform: channel.platform,
    customerRef: event.senderId,
    customerName: event.senderName,
    message: event.text,
    personaPrompt: channel.aiPersonaPrompt,
    origin,
  });

  if (!bot.reply) {
    return {
      ...base,
      status: "skipped",
      reason: bot.status === "HANDED_TO_HUMAN" ? "HANDED_TO_HUMAN" : "NO_REPLY",
    };
  }

  const delivery = await sendSocialText({
    platform: channel.platform,
    accessToken: channel.accessToken,
    recipientId: event.senderId,
    pageId: channel.pageId,
    text: bot.reply,
  });

  return {
    ...base,
    status: "handled",
    reply: bot.reply,
    source: bot.source,
    ...(bot.orderId ? { orderId: bot.orderId } : {}),
    delivery: delivery.delivered
      ? "dm:delivered"
      : `dm:${delivery.skipped ?? delivery.error ?? "failed"}`,
  };
}

// ---------------------------------------------------------------------------
// Signature + verification handshake
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.SOCIAL_APP_SECRET;
  if (!appSecret) return true; // Signature checking is opt-in via env.
  if (!signatureHeader) return false;

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

  const expected =
    process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    "";

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/** POST – comments and direct messages from Facebook / Instagram / WhatsApp. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RawPayload;
  try {
    payload = JSON.parse(rawBody) as RawPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let events: SocialEvent[];
  try {
    events = parseEvents(payload);
  } catch (error) {
    console.error("Social webhook parse error:", error);
    return NextResponse.json({ error: "Unparsable payload" }, { status: 400 });
  }

  if (events.length === 0) {
    // Always 200 so Meta does not retry the delivery.
    return NextResponse.json({ received: true, events: [] });
  }

  const origin = request.nextUrl.origin;
  const results: EventResult[] = [];

  for (const event of events) {
    try {
      results.push(await handleEvent(event, origin));
    } catch (error) {
      console.error("Social webhook event error:", error);
      results.push({
        kind: event.kind,
        platform: event.platform,
        status: "ignored",
        reason: "HANDLER_ERROR",
      });
    }
  }

  return NextResponse.json({ received: true, events: results });
}

import "server-only";

/**
 * Thin Graph API client for the AI Social Selling engine.
 *
 * Handles the three outbound calls the webhook needs:
 *   1. sendSocialText      — Messenger / Instagram DM / WhatsApp text message
 *   2. replyToComment      — public reply on a Facebook / Instagram comment
 *   3. sendProductDetails  — canned DM with product details (comment -> DM)
 *
 * Every function is best-effort: network failures and missing credentials
 * resolve to a structured outcome instead of throwing, so a webhook delivery
 * never gets retried into a loop by Meta.
 */

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const REQUEST_TIMEOUT_MS = 10_000;

/** Public comment reply mandated by the product spec. */
export const COMMENT_REPLY_TEXT = "تم الرد في الخاص 📥";

export interface SendOutcome {
  delivered: boolean;
  skipped?: "NO_ACCESS_TOKEN" | "NO_RECIPIENT";
  error?: string;
}

async function graphPost(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const response = await fetch(`${GRAPH_API_BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      id?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: payload.error?.message ?? `Graph API responded ${response.status}`,
      };
    }

    return { ok: true, id: payload.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Graph API request failed",
    };
  }
}

export interface SocialTextParams {
  platform: "FACEBOOK" | "INSTAGRAM" | "WHATSAPP";
  /** Decrypted page / phone-number access token. */
  accessToken: string;
  /** Messenger PSID, Instagram scoped id, or E.164 phone number. */
  recipientId: string;
  /** Page / phone-number id the message goes out from. */
  pageId?: string;
  text: string;
}

/** Sends a text DM through the right Graph API surface for the platform. */
export async function sendSocialText(params: SocialTextParams): Promise<SendOutcome> {
  if (!params.accessToken) return { delivered: false, skipped: "NO_ACCESS_TOKEN" };
  if (!params.recipientId) return { delivered: false, skipped: "NO_RECIPIENT" };

  const text = params.text.slice(0, 4000);

  if (params.platform === "WHATSAPP") {
    const from = params.pageId || "me";
    const result = await graphPost(`${from}/messages`, {
      messaging_product: "whatsapp",
      to: params.recipientId.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: text },
      access_token: params.accessToken,
    });
    return result.ok
      ? { delivered: true }
      : { delivered: false, error: result.error ?? "WhatsApp send failed" };
  }

  const result = await graphPost("me/messages", {
    recipient: { id: params.recipientId },
    message: { text },
    messaging_type: "RESPONSE",
    access_token: params.accessToken,
  });

  return result.ok
    ? { delivered: true }
    : { delivered: false, error: result.error ?? "Messenger send failed" };
}

/** Posts a public reply under a Facebook / Instagram comment. */
export async function replyToComment(params: {
  accessToken: string;
  commentId: string;
  text?: string;
}): Promise<SendOutcome> {
  if (!params.accessToken) return { delivered: false, skipped: "NO_ACCESS_TOKEN" };
  if (!params.commentId) return { delivered: false, skipped: "NO_RECIPIENT" };

  const result = await graphPost(`${params.commentId}/comments`, {
    message: params.text || COMMENT_REPLY_TEXT,
    access_token: params.accessToken,
  });

  return result.ok
    ? { delivered: true }
    : { delivered: false, error: result.error ?? "Comment reply failed" };
}

/**
 * Client-safe COD verification constants (no server-only imports) so both the
 * merchant dashboard and the storefront can share the same definitions.
 */

export type CodVerificationStatus =
  | "NOT_REQUIRED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "EXPIRED";

export type CodDecision = "CONFIRMED" | "CANCELLED";

/** Pay-later methods that must be verified before fulfilment. */
export const COD_PAYMENT_METHODS = ["cod", "manual"] as const;

export function isCodOrder(order: { paymentMethod?: string | null }): boolean {
  return COD_PAYMENT_METHODS.includes(
    (order.paymentMethod ?? "") as (typeof COD_PAYMENT_METHODS)[number]
  );
}

export const COD_REPLY_CONFIRM_PREFIX = "COD_CONFIRM_";
export const COD_REPLY_CANCEL_PREFIX = "COD_CANCEL_";

/**
 * Signed tokens embedded in the COD verification link. All three are optional
 * so existing callers keep working, but a link without them can only be used
 * by an authenticated merchant (the customer-facing page rejects it).
 */
export interface CodVerificationTokens {
  trackToken?: string;
  confirmToken?: string;
  cancelToken?: string;
}

function appendQuery(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Fallback short link used inside the WhatsApp message, the dashboard and the
 * customer-facing page: https://{slug}.{rootDomain}/order/{id}/verify
 * `origin` is only used as a last resort when no public site URL is configured.
 */
export function buildCodVerificationUrl(
  storeSlug: string,
  orderId: string,
  origin?: string,
  tokens: CodVerificationTokens = {}
): string {
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "").trim();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (origin || "")
  ).replace(/\/$/, "");

  let url = rootDomain
    ? `https://${storeSlug}.${rootDomain}/order/${orderId}/verify`
    : `${siteUrl}/store/${storeSlug}/order/${orderId}/verify`;

  if (tokens.trackToken) url = appendQuery(url, "token", tokens.trackToken);
  if (tokens.confirmToken) {
    url = appendQuery(url, "confirm_token", tokens.confirmToken);
  }
  if (tokens.cancelToken) {
    url = appendQuery(url, "cancel_token", tokens.cancelToken);
  }

  return url;
}

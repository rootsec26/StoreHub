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
 * Fallback short link used inside the WhatsApp message, the dashboard and the
 * customer-facing page: https://{slug}.{rootDomain}/order/{id}/verify
 * `origin` is only used as a last resort when no public site URL is configured.
 */
export function buildCodVerificationUrl(
  storeSlug: string,
  orderId: string,
  origin?: string
): string {
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "").trim();
  if (rootDomain) {
    return `https://${storeSlug}.${rootDomain}/order/${orderId}/verify`;
  }
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (origin || "")
  ).replace(/\/$/, "");
  return `${siteUrl}/store/${storeSlug}/order/${orderId}/verify`;
}

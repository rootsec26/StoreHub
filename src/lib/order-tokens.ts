import crypto from "crypto";

/**
 * Signed, expiring tokens for customer-facing order links.
 *
 * The public tracking / cancel / COD-verification flows used to trust only an
 * order UUID plus the public store slug. That made every order ID a bearer
 * credential (and order IDs were themselves discoverable by phone number).
 *
 * Tokens are HMAC-SHA256 signed with `ORDER_LINK_SECRET` (falling back to the
 * app `JWT_SECRET` so existing deployments keep working) and bound to:
 *   - the order id (`o`)
 *   - the action purpose (`p`)
 *   - an absolute expiry (`e`, unix seconds)
 *
 * The store id is intentionally not stored in the token: every route loads the
 * order first and scopes the lookup to the store from the URL, so a token can
 * never be replayed against another tenant.
 */

export type OrderTokenPurpose =
  | "track"
  | "cancel"
  | "cod_confirm"
  | "cod_cancel"
  | "payment_proof";

export interface OrderTokenPayload {
  orderId: string;
  purpose: OrderTokenPurpose;
  /** Unix timestamp (seconds) after which the token is invalid. */
  expiresAt: number;
}

const TOKEN_VERSION = "v1";
const DAY_SECONDS = 60 * 60 * 24;

const DEFAULT_TTL_SECONDS: Record<OrderTokenPurpose, number> = {
  track: 30 * DAY_SECONDS,
  cancel: 7 * DAY_SECONDS,
  cod_confirm: 7 * DAY_SECONDS,
  cod_cancel: 7 * DAY_SECONDS,
  payment_proof: 7 * DAY_SECONDS,
};

let warnedAboutFallbackSecret = false;

function getSigningSecret(): string {
  const secret = process.env.ORDER_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ORDER_LINK_SECRET (or JWT_SECRET) must be set to sign order links"
    );
  }
  if (!process.env.ORDER_LINK_SECRET && !warnedAboutFallbackSecret) {
    warnedAboutFallbackSecret = true;
    console.warn(
      "[order-tokens] ORDER_LINK_SECRET is not set; falling back to JWT_SECRET. " +
        "Set a dedicated ORDER_LINK_SECRET before production."
    );
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(unsigned: string): string {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(unsigned)
    .digest("base64url");
}

function isPurpose(value: unknown): value is OrderTokenPurpose {
  return (
    value === "track" ||
    value === "cancel" ||
    value === "cod_confirm" ||
    value === "cod_cancel" ||
    value === "payment_proof"
  );
}

/**
 * Creates a signed token for one order + purpose.
 *
 * `expiresInSeconds` is capped at 30 days to keep customer links bounded.
 */
export function createOrderToken(params: {
  orderId: string;
  purpose: OrderTokenPurpose;
  expiresInSeconds?: number;
}): string {
  const ttl = Math.max(
    60,
    Math.min(
      30 * DAY_SECONDS,
      Math.floor(params.expiresInSeconds ?? DEFAULT_TTL_SECONDS[params.purpose])
    )
  );

  const payload = {
    v: 1,
    o: params.orderId,
    p: params.purpose,
    e: Math.floor(Date.now() / 1000) + ttl,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${TOKEN_VERSION}.${encodedPayload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

/**
 * Verifies a token's signature, expiry and (optionally) its binding to a
 * specific order/purpose. Returns `null` for anything that does not match.
 */
export function verifyOrderToken(
  token: string | null | undefined,
  expected: {
    orderId?: string;
    purpose?: OrderTokenPurpose | readonly OrderTokenPurpose[];
  } = {}
): OrderTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;

  const [, encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(`${TOKEN_VERSION}.${encodedPayload}`);
  const received = Buffer.from(signature);
  const wanted = Buffer.from(expectedSignature);
  if (received.length !== wanted.length) return null;
  if (!crypto.timingSafeEqual(received, wanted)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const orderId = record.o;
  const purpose = record.p;
  const expiresAt = record.e;

  if (typeof orderId !== "string" || orderId.length === 0) return null;
  if (!isPurpose(purpose)) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return null;

  if (expected.orderId && expected.orderId !== orderId) return null;

  if (expected.purpose) {
    const allowed = Array.isArray(expected.purpose)
      ? expected.purpose
      : [expected.purpose];
    if (!allowed.includes(purpose)) return null;
  }

  return { orderId, purpose, expiresAt };
}

/** Reads a token from `?token=` (the canonical link parameter). */
export function orderTokenFromRequest(request: {
  nextUrl: { searchParams: URLSearchParams };
}): string | null {
  return (
    request.nextUrl.searchParams.get("token") ||
    request.nextUrl.searchParams.get("order_token") ||
    null
  );
}

/**
 * Appends a query parameter without destroying an existing query string or
 * hash. Works with absolute and relative URLs.
 */
export function appendQueryParam(
  url: string,
  key: string,
  value: string
): string {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator = base.includes("?")
    ? base.endsWith("?") || base.endsWith("&")
      ? ""
      : "&"
    : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(
    value
  )}${hash}`;
}

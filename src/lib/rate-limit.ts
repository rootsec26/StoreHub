import { NextRequest, NextResponse } from "next/server";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetTime < now) {
      memoryStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60000);

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = "rl", message = "Too many requests" } = options;

  return async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const key = `${keyPrefix}:${ip}`;

    const now = Date.now();
    const entry = memoryStore.get(key);

    if (!entry || entry.resetTime < now) {
      memoryStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return null;
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return NextResponse.json(
        { error: message, code: "RATE_LIMIT_EXCEEDED", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    entry.count++;
    return null;
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "auth",
  message: "Too many authentication attempts. Please try again later.",
});

export const checkoutRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: "checkout",
  message: "Too many checkout attempts. Please slow down.",
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: "ai",
  message: "Too many AI requests. Please wait before trying again.",
});

/** Guards the metered WhatsApp resend quick action (spends credits per send). */
export const resendVerificationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: "resend-verification",
  message: "Too many verification resend attempts. Please wait before trying again.",
});

/** Throttles public phone-keyed loyalty profile lookups (enumeration guard). */
export const storefrontLoyaltyRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: "storefront-loyalty",
  message: "Too many loyalty lookups. Please wait before trying again.",
});

/** Throttles the public guest abandoned-cart auto-save endpoint. */
export const abandonedCartRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: "abandoned-cart",
  message: "Too many cart sync requests. Please slow down.",
});

/** The storefront AI assistant scans the whole catalog per message — keep it cheap. */
export const storefrontAssistantRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: "storefront-assistant",
  message: "Too many assistant requests. Please wait before trying again.",
});

/** Price-alert signups write rows (and later trigger metered alerts) per call. */
export const priceAlertRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: "price-alert",
  message: "Too many alert requests. Please wait before trying again.",
});

/** Coupon previews hit the DB per attempt — cap enumeration speed. */
export const couponValidateRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: "coupon-validate",
  message: "Too many coupon checks. Please slow down.",
});

/** Page-view beacons are chatty but must stay cheap for real visitors. */
export const analyticsTrackRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  keyPrefix: "analytics-track",
  message: "Too many analytics events. Please slow down.",
});

export async function withRateLimit(
  request: NextRequest,
  limiter: (req: NextRequest) => Promise<NextResponse | null>
): Promise<NextResponse | null> {
  return limiter(request);
}

/**
 * Low-level fixed-window check against the shared in-memory store for callers
 * that need a custom key (e.g. store+phone) rather than the client IP.
 */
export async function consumeRateLimit(options: {
  key: string;
  windowMs: number;
  maxRequests: number;
  message?: string;
}): Promise<NextResponse | null> {
  const { key, windowMs, maxRequests, message = "Too many requests" } = options;

  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetTime < now) {
    memoryStore.set(key, { count: 1, resetTime: now + windowMs });
    return null;
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return NextResponse.json(
      { error: message, code: "RATE_LIMIT_EXCEEDED", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  entry.count++;
  return null;
}
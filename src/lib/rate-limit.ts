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

export async function withRateLimit(
  request: NextRequest,
  limiter: (req: NextRequest) => Promise<NextResponse | null>
): Promise<NextResponse | null> {
  return limiter(request);
}
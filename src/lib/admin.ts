import { timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";

/**
 * Strict admin authorization.
 *
 * Identity comes ONLY from a secret token compared in constant time.
 * Never derive it from `Host` / `X-Forwarded-For` / `X-Real-IP` — those are
 * attacker-controlled request headers on any deployment that is reachable
 * directly or behind a proxy that does not strip them.
 *
 * Presentation:
 *   - API clients : `x-admin-token: <ADMIN_TOKEN>` (or `Authorization: Bearer`)
 *   - Browser UI  : `admin_token` cookie, which middleware sets after a valid
 *                   `?admin_token=<ADMIN_TOKEN>` visit to /admin
 *   - Development : if no ADMIN_TOKEN is configured and NODE_ENV !== production,
 *                   local development is allowed (operator convenience).
 *   - Production  : fails CLOSED — ADMIN_TOKEN must be set, otherwise every
 *                   admin surface returns 403/404.
 */

/** Header used by API clients (curl/CI) to present the admin token. */
export const ADMIN_TOKEN_HEADER = "x-admin-token";
/** Cookie used by the browser admin UI (set by middleware). */
export const ADMIN_TOKEN_COOKIE = "admin_token";
/** Query parameter used once to bootstrap the cookie on first visit. */
export const ADMIN_TOKEN_QUERY = "admin_token";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Constant-time comparison of a presented token against `ADMIN_TOKEN`. */
export function verifyAdminToken(candidate: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!candidate || !expected) return false;
  return safeEqual(candidate, expected);
}

/**
 * Local development escape hatch: only when no ADMIN_TOKEN is configured AND
 * we are not running a production build. Production always fails closed.
 */
export function isDevelopmentAdminFallback(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.ADMIN_TOKEN;
}

/**
 * Authorize the current request/view. Safe to call from route handlers and
 * server components (uses `headers()` / `cookies()` from `next/headers`).
 */
export async function isAdminAuthorized(): Promise<boolean> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const authHeader = headerStore.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

  const candidates = [
    headerStore.get(ADMIN_TOKEN_HEADER),
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value ?? null,
    bearer,
  ];
  for (const candidate of candidates) {
    if (verifyAdminToken(candidate)) return true;
  }

  return isDevelopmentAdminFallback();
}

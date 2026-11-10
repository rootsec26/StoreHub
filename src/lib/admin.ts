import { timingSafeEqual } from "crypto";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Fallback admin email used when ADMIN_EMAIL is not configured.
 * Overridable per-environment via the ADMIN_EMAIL env var.
 */
const DEFAULT_ADMIN_EMAIL = "rootsec68@gmail.com";

/** The single email allowed to access admin/dashboard surfaces. */
export function getAdminEmail(): string {
  return (
    process.env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL
  ).toLowerCase();
}

/** Constant-time-ish email check (emails are not secret; normalize case). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getAdminEmail();
}

/**
 * Read the `email` claim from the app's `session` JWT cookie without going
 * through `getSession()` — keeps this module safe to import from proxy.ts.
 */
async function sessionEmailFromCookies(): Promise<string | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    const email = (payload as { email?: unknown }).email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

/**
 * Super-admin authorization.
 *
 * Identity comes from the app's signed `session` JWT: the caller is an admin
 * IFF the session email matches ADMIN_EMAIL (default rootsec68@gmail.com).
 * Never derive identity from `Host` / `X-Forwarded-For` / `X-Real-IP` — those
 * are attacker-controlled request headers.
 *
 * The legacy ADMIN_TOKEN helpers below are kept for backwards compatibility
 * but are no longer required — a valid super-admin session is sufficient and
 * necessary in every environment (localhost and production alike).
 */

/** @deprecated Admin access is granted by ADMIN_EMAIL session, not tokens. */
export const ADMIN_TOKEN_HEADER = "x-admin-token";
/** @deprecated Admin access is granted by ADMIN_EMAIL session, not tokens. */
export const ADMIN_TOKEN_COOKIE = "admin_token";
/** @deprecated Admin access is granted by ADMIN_EMAIL session, not tokens. */
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
 * server components (uses `cookies()` from `next/headers`).
 *
 * Returns true only when the request carries a valid session JWT whose email
 * matches the configured super-admin email.
 */
export async function isAdminAuthorized(): Promise<boolean> {
  return isAdminEmail(await sessionEmailFromCookies());
}

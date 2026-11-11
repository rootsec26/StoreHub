"use client";

export const FOLLOWER_ID_KEY = "storehub:follower-id";
export const FOLLOW_SYNC_EVENT = "storehub:follow-sync";

export type FollowActionType = "follow_platform" | "follow_store";

/**
 * App-only path prefixes — anything else on a storefront domain is a
 * storefront path that must be canonicalized to `/store/<slug>/…` before it
 * can be used as a post-login `next` target on the apex app.
 */
const APP_PATH_PREFIXES = [
  "/",
  "/dashboard",
  "/login",
  "/sign-in",
  "/signup",
  "/onboarding",
  "/create-store",
  "/forgot-password",
  "/accept-invite",
  "/admin",
  "/api",
  "/auth",
  "/feed",
  "/download",
  "/_next",
];

function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** localStorage UUID used to identify anonymous followers. */
export function getStoredFollowerId(): string | null {
  try {
    return window.localStorage.getItem(FOLLOWER_ID_KEY);
  } catch {
    return null;
  }
}

function withActionParams(
  returnPath: string,
  action: FollowActionType,
  storeSlug?: string
): string {
  const [path, query = ""] = returnPath.split("?");
  const params = new URLSearchParams(query);
  params.set("action", action);
  if (storeSlug) params.set("store", storeSlug);
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}`;
}

/**
 * Builds the `/login?next=…` URL that sends a logged-out visitor through
 * Google OAuth and back to `returnPath` carrying `?action=follow_*`.
 *
 * `returnPath` is canonicalized so it is always valid on the apex app:
 * storefront paths observed on subdomains/custom domains are rewritten to
 * `/store/<slug><path>` (or `/store/<slug>` for app paths).
 */
export function buildFollowLoginUrl(options: {
  action: FollowActionType;
  storeSlug?: string;
}): string {
  const { action, storeSlug } = options;
  if (typeof window === "undefined") return "/login";

  const { pathname, search } = window.location;
  let returnPath: string;

  if (action === "follow_store" && storeSlug) {
    const slug = encodeURIComponent(storeSlug);
    const base = pathname.startsWith("/store/")
      ? pathname
      : isAppPath(pathname)
        ? `/store/${slug}`
        : `/store/${slug}${pathname === "/" ? "" : pathname}`;
    returnPath = `${base}${search}`;
  } else {
    const base = isAppPath(pathname) ? pathname : "/";
    returnPath = `${base}${search}`;
  }

  const target = withActionParams(returnPath, action, storeSlug);
  return `/login?next=${encodeURIComponent(target)}`;
}

import { PRODUCTION_SITE_URL, safeParseUrl, urlToString } from "@/lib/url";

export const SITE_NAME = "StoreHub";

export const SITE_DESCRIPTION =
  "Create your own online store in minutes. Manage products, track orders, and serve customers through unique storefront URLs.";

export function getSiteUrl(): string {
  // 1. Explicit override — set NEXT_PUBLIC_SITE_URL for local dev
  //    (e.g. http://localhost:3000) or a custom production domain.
  const explicit = safeParseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return urlToString(explicit) || PRODUCTION_SITE_URL;

  // 2. Genuine browser environment — the origin the user is actually on.
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // 3. Canonical production domain. Never fall back to localhost: Vercel's
  //    per-deployment URLs are unstable and a missing env var must not leak a
  //    loopback origin into generated links, redirects or metadata.
  return PRODUCTION_SITE_URL;
}

export function getRootDomain(): string | null {
  const explicit = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (explicit) return explicit.replace(/\.+$/, "").toLowerCase() || null;
  return null;
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function storePath(slug: string): string {
  return `/store/${slug}`;
}

export function productPath(slug: string, productId: string): string {
  return `/store/${slug}/product/${productId}`;
}

export function checkoutPath(slug: string): string {
  return `/store/${slug}/checkout`;
}

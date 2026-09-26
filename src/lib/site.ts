import { LOCAL_FALLBACK_URL, safeParseUrl, urlToString } from "@/lib/url";

export const SITE_NAME = "StoreHub";

export const SITE_DESCRIPTION =
  "Create your own online store in minutes. Manage products, track orders, and serve customers through unique storefront URLs.";

export function getSiteUrl(): string {
  const explicit = safeParseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return urlToString(explicit) || LOCAL_FALLBACK_URL;

  const vercel = safeParseUrl(process.env.VERCEL_URL, "https");
  if (vercel) return urlToString(vercel) || LOCAL_FALLBACK_URL;

  return LOCAL_FALLBACK_URL;
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

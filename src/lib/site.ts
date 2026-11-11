import { PRODUCTION_SITE_URL, safeParseUrl, urlToString } from "@/lib/url";

export const AURA_SITE_NAME = "Aura";

export const AURA_SITE_DESCRIPTION =
  "Aura is a scalable SaaS ecosystem. Start with StoreHub, our flagship multi-tenant e-commerce platform, with more products on the way.";

export const SITE_NAME = "StoreHub";

export const SITE_DESCRIPTION =
  "Create your own online store in minutes. Manage products, track orders, and serve customers through unique storefront URLs.";

export function getSiteUrl(): string {
  // 1. Browser — the origin the user is actually on. This makes local
  //    development (http://localhost:3000), Vercel previews and the
  //    production domain each resolve to themselves automatically.
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // 2. Server-side resolution, driven by the deployment environment.
  const explicit = safeParseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const explicitUrl = explicit ? urlToString(explicit) : "";

  if (process.env.VERCEL_URL) {
    // On Vercel: previews should emit their own deployment URL so generated
    // links/callbacks stay on the preview; production uses the configured
    // site URL (or the project's production domain as a last resort).
    if (process.env.VERCEL_ENV === "preview") {
      return `https://${process.env.VERCEL_URL}`;
    }
    if (explicitUrl) return explicitUrl;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    }
    return PRODUCTION_SITE_URL;
  }

  // 3. Local development / self-hosted. Local runs default to loopback so
  //    generated URLs (OAuth redirects, metadata, sitemaps, payment return
  //    URLs) never point at production. Set NEXT_PUBLIC_SITE_URL to override —
  //    e.g. for a custom domain or a non-3000 port.
  if (explicitUrl) return explicitUrl;
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || "3000"}`;
  }
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

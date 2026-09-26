export const SITE_NAME = "StoreHub";

export const SITE_DESCRIPTION =
  "Create your own online store in minutes. Manage products, track orders, and serve customers through unique storefront URLs.";

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return `https://${vercel.replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
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

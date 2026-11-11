/**
 * Deep-link parsing for the StoreHub desktop app.
 *
 * Supported incoming URLs:
 *   storehub://store/<slug>[/product/<id>...]        → /store/<slug>/...
 *   com.storehub.app://store/<slug>/...              → /store/<slug>/... (Android)
 *   <scheme>://open?url=<encoded web URL>            → that URL's path on our origin
 *   https://<our-domain>/<any path>                  → path as-is (defensive)
 *
 * Only same-site absolute paths are returned — anything that doesn't resolve
 * to an internal "/..." route is rejected so a crafted link can't redirect
 * the webview off-site.
 */

const ALLOWED_HOSTS = new Set([
  "store-hub-beta.vercel.app",
  "storehub.app",
  "localhost",
  "127.0.0.1",
]);

function sanitizePath(pathname: string, search: string, hash: string): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  // Keep only storefront/dashboard routes — never external or api internals.
  if (
    !pathname.startsWith("/store/") &&
    !pathname.startsWith("/dashboard") &&
    pathname !== "/"
  ) {
    return null;
  }
  return `${pathname}${search}${hash}`;
}

/** Custom URL schemes registered by the native app shells. */
const CUSTOM_SCHEMES = new Set(["storehub:", "com.storehub.app:"]);

export function deepLinkToPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (CUSTOM_SCHEMES.has(url.protocol)) {
    // storehub://open?url=https%3A%2F%2F...  — unwrap the real web URL.
    if (url.hostname === "open") {
      const target = url.searchParams.get("url");
      if (!target) return null;
      try {
        const inner = new URL(target);
        if (inner.protocol !== "https:" && inner.protocol !== "http:") return null;
        return sanitizePath(inner.pathname, inner.search, inner.hash);
      } catch {
        return null;
      }
    }

    // storehub://store/<slug>/... — hostname holds the first path segment.
    const segments = [url.hostname, ...url.pathname.split("/").filter(Boolean)];
    const path = `/${segments.filter(Boolean).join("/")}`;
    return sanitizePath(path, url.search, url.hash);
  }

  if (url.protocol === "https:" || url.protocol === "http:") {
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host) && host !== window.location.hostname) {
      return null;
    }
    return sanitizePath(url.pathname, url.search, url.hash);
  }

  return null;
}

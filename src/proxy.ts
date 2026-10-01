import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { safeParseUrl, safeResolveUrl } from "@/lib/url";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultCurrencyForCountry } from "@/lib/currency";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required but not set");
}
const SECRET = new TextEncoder().encode(jwtSecret);

interface SessionClaims {
  storeId?: string;
}

const CURRENCY_COOKIE_NAME = "storehub_currency";
const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function detectCurrencyFromHeaders(request: NextRequest): string {
  const vercelCountry = request.headers.get("x-vercel-ip-country");
  const cloudflareCountry = request.headers.get("cf-ipcountry");
  const countryCode = vercelCountry ?? cloudflareCountry ?? "";
  return getDefaultCurrencyForCountry(countryCode);
}

function setCurrencyCookie(response: NextResponse, currency: string): void {
  response.cookies.set(CURRENCY_COOKIE_NAME, currency, {
    maxAge: CURRENCY_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function getCurrencyFromCookie(request: NextRequest): string | null {
  return request.cookies.get(CURRENCY_COOKIE_NAME)?.value ?? null;
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "blog",
  "docs",
  "status",
  "dev",
  "staging",
  "test",
  "preview",
]);

const APP_ONLY_PATHS = [
  "/dashboard",
  "/login",
  "/signup",
  "/create-store",
  "/onboarding",
  "/forgot-password",
];

let customDomainCache: Map<string, { slug: string; expires: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const cached = customDomainCache.get(hostname);
  if (cached && cached.expires > Date.now()) {
    return cached.slug;
  }

  try {
    const result = await db
      .select({ slug: stores.slug })
      .from(stores)
      .where(eq(stores.customDomain, hostname))
      .limit(1);

    if (result.length > 0) {
      const slug = result[0].slug;
      customDomainCache.set(hostname, { slug, expires: Date.now() + CACHE_TTL });
      return slug;
    }
  } catch (error) {
    console.error("[proxy] Custom domain lookup failed:", error);
  }

  customDomainCache.set(hostname, { slug: "", expires: Date.now() + CACHE_TTL });
  return null;
}

function resolveStoreSubdomain(
  host: string | null
): { slug: string; rootDomain: string } | null {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase();
  if (!hostname || !hostname.includes(".")) return null;

  let rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "")
    .replace(/\.+$/, "")
    .toLowerCase();

  if (!rootDomain) {
    if (hostname.endsWith(".localhost")) {
      rootDomain = "localhost";
    } else {
      const labels = hostname.split(".");
      if (labels.length <= 2) return null;
      rootDomain = labels.slice(-2).join(".");
    }
  }

  if (!hostname.endsWith(`.${rootDomain}`)) return null;

  const label = hostname.slice(0, -(rootDomain.length + 1));
  if (!label || label.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;

  return { slug: label, rootDomain };
}

function storePathForSubdomain(pathname: string, slug: string): string {
  if (pathname === "/") return `/store/${slug}`;
  if (pathname.startsWith("/store/")) return pathname;
  return `/store/${slug}${pathname}`;
}

function isAppOnlyPath(pathname: string): boolean {
  return APP_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isCrawlerFile(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/sitemap.")
  );
}

function resolveUrl(request: NextRequest, path: string): URL {
  return safeResolveUrl(path, request.url) ?? request.nextUrl;
}

function buildApexUrl(request: NextRequest, rootDomain: string): URL {
  const hostHeader = request.headers.get("host") ?? "";
  const hostUrl = safeParseUrl(`http://${hostHeader}`, "http");
  const port = hostUrl?.port ? `:${hostUrl.port}` : "";

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const rawProtocol = forwardedProto || request.nextUrl.protocol;
  const withColon = rawProtocol.endsWith(":") ? rawProtocol : `${rawProtocol}:`;
  const protocol =
    withColon === "http:" || withColon === "https:"
      ? withColon
      : request.nextUrl.protocol;

  return (
    safeParseUrl(
      `${protocol}//${rootDomain}${port}${request.nextUrl.pathname}${request.nextUrl.search}`
    ) ?? request.nextUrl
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session")?.value;

  const hostHeader = request.headers.get("host");
  const hostname = hostHeader?.split(":")[0].toLowerCase() ?? "";

  const subdomain = resolveStoreSubdomain(hostHeader);
  const customDomainSlug = subdomain ? null : await resolveCustomDomain(hostname);

  const effectiveSlug = subdomain?.slug ?? customDomainSlug;

  // Handle currency detection for storefront pages
  const isStorefrontPage = pathname.startsWith("/store/");
  let currencyCookieSet = false;
  let response: NextResponse | null = null;

  if (effectiveSlug) {
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      isCrawlerFile(pathname)
    ) {
      return NextResponse.next();
    }

    if (!isAppOnlyPath(pathname)) {
      const target = storePathForSubdomain(pathname, effectiveSlug);
      if (target === pathname) {
        // For storefront pages, apply currency detection
        if (isStorefrontPage) {
          const existingCurrency = getCurrencyFromCookie(request);
          if (!existingCurrency) {
            const detectedCurrency = detectCurrencyFromHeaders(request);
            response = NextResponse.rewrite(resolveUrl(request, target));
            setCurrencyCookie(response, detectedCurrency);
            currencyCookieSet = true;
          }
        }
        if (!currencyCookieSet) return NextResponse.next();
        return response!;
      }
      return NextResponse.rewrite(resolveUrl(request, target));
    }

    const rootDomain = subdomain?.rootDomain ?? (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
    if (rootDomain) {
      const apex = buildApexUrl(request, rootDomain);
      const requestOrigin =
        safeParseUrl(request.url)?.origin ?? request.nextUrl.origin;
      if (apex.origin !== requestOrigin) {
        return NextResponse.redirect(apex);
      }
    }
  }

  // API routes, static paths and crawler files handle their own auth
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    isCrawlerFile(pathname)
  ) {
    return NextResponse.next();
  }

  // Public pages that don't require auth
  const isPublicPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/store/");

  // Admin routes require valid auth session AND localhost host validation
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminPath) {
    const isLocalhost =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");

    if (!isLocalhost) {
      return NextResponse.json(
        { error: "Forbidden: Admin access only allowed from localhost" },
        { status: 403 }
      );
    }

    if (!token) {
      return NextResponse.redirect(resolveUrl(request, "/login"));
    }

    try {
      await jwtVerify(token, SECRET);
    } catch {
      const response = NextResponse.redirect(resolveUrl(request, "/login"));
      response.cookies.delete("session");
      return response;
    }

    return NextResponse.next();
  }

  // If logged in and on auth pages, send the user where they actually belong:
  // owners with a store go to the dashboard, new users go to store creation.
  if (token && (pathname === "/login" || pathname === "/signup")) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const hasStore = Boolean((payload as SessionClaims).storeId);
      return NextResponse.redirect(
        resolveUrl(request, hasStore ? "/dashboard" : "/create-store")
      );
    } catch {
      // Invalid token, continue to auth page
    }
  }

  // Apply currency detection for direct storefront access (not via subdomain rewrite)
  if (isStorefrontPage && !currencyCookieSet) {
    const existingCurrency = getCurrencyFromCookie(request);
    if (!existingCurrency) {
      const detectedCurrency = detectCurrencyFromHeaders(request);
      response = NextResponse.next();
      setCurrencyCookie(response, detectedCurrency);
      return response;
    }
  }

  if (isPublicPage) {
    return NextResponse.next();
  }

  // Protected pages require a valid token
  if (!token) {
    return NextResponse.redirect(resolveUrl(request, "/login"));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const storeId = (payload as SessionClaims).storeId;

    // Onboarding: users who already own a store skip store creation.
    if (pathname === "/create-store" || pathname === "/onboarding") {
      return storeId
        ? NextResponse.redirect(resolveUrl(request, "/dashboard"))
        : NextResponse.next();
    }

    // Dashboard: if user doesn't have a store, redirect to onboarding
    if (pathname.startsWith("/dashboard") && !storeId) {
      return NextResponse.redirect(resolveUrl(request, "/onboarding"));
    }

    return NextResponse.next();
  } catch {
    // Invalid token
    const response = NextResponse.redirect(resolveUrl(request, "/login"));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

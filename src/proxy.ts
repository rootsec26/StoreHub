import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { safeParseUrl, safeResolveUrl } from "@/lib/url";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "super-secret-key-change-in-production"
);

interface SessionClaims {
  storeId?: string;
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
  "/forgot-password",
];

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

  const subdomain = resolveStoreSubdomain(request.headers.get("host"));
  if (subdomain) {
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      isCrawlerFile(pathname)
    ) {
      return NextResponse.next();
    }

    if (!isAppOnlyPath(pathname)) {
      const target = storePathForSubdomain(pathname, subdomain.slug);
      if (target === pathname) return NextResponse.next();
      return NextResponse.rewrite(resolveUrl(request, target));
    }

    // App-only pages live on the apex domain. When the apex resolves to this
    // same origin (local `*.localhost` development) a redirect would loop, so
    // those requests fall through to the standard auth flow instead.
    const apex = buildApexUrl(request, subdomain.rootDomain);
    const requestOrigin =
      safeParseUrl(request.url)?.origin ?? request.nextUrl.origin;
    if (apex.origin !== requestOrigin) {
      return NextResponse.redirect(apex);
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
    if (pathname === "/create-store") {
      return storeId
        ? NextResponse.redirect(resolveUrl(request, "/dashboard"))
        : NextResponse.next();
    }

    // Dashboard: if user doesn't have a store, redirect to create-store
    if (pathname.startsWith("/dashboard") && !storeId) {
      return NextResponse.redirect(resolveUrl(request, "/create-store"));
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

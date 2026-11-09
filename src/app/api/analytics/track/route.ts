import { NextRequest, NextResponse } from "next/server";

import {
  normalizeAnalyticsVisitorId,
  recordAnalyticsEvent,
} from "@/lib/analytics";
import { analyticsTrackRateLimiter, withRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BOT_USER_AGENT =
  /bot|crawler|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|headlesschrome|lighthouse|pingdom|uptime/i;

const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];

function sanitizePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) {
    return null;
  }
  return path;
}

/**
 * POST /api/analytics/track — public page-view beacon.
 * Only PAGE_VIEW events are accepted here; SIGNUP / ORDER_CREATED conversions
 * are recorded server-side by the auth and checkout APIs.
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, analyticsTrackRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (BOT_USER_AGENT.test(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const payload =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (payload.eventType !== "PAGE_VIEW") {
    return new NextResponse(null, { status: 204 });
  }

  const visitorId = normalizeAnalyticsVisitorId(payload.visitorId);
  const path = sanitizePath(payload.path ?? request.nextUrl.pathname);

  if (!visitorId || !path || EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return new NextResponse(null, { status: 204 });
  }

  await recordAnalyticsEvent({
    eventType: "PAGE_VIEW",
    visitorId,
    path,
    metadata: { source: "web" },
  });

  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";

import {
  expireStalePlatformBroadcasts,
  getActivePlatformBroadcast,
} from "@/lib/platform-banner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform-banner — the currently live site-wide banner, or null.
 * Public endpoint consumed by the storefront banner component.
 */
export async function GET() {
  try {
    // Lazily retire expired rows so admin lists stay accurate.
    await expireStalePlatformBroadcasts().catch(() => undefined);
    const broadcast = await getActivePlatformBroadcast();
    return NextResponse.json(
      { broadcast },
      {
        headers: {
          // Safe to cache briefly at the edge/CDN; expiry is re-checked per request.
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Failed to load platform banner:", error);
    return NextResponse.json({ broadcast: null });
  }
}

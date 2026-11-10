import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";
import {
  createPlatformBroadcast,
  listPlatformBroadcasts,
  MAX_BANNER_DURATION_HOURS,
  MAX_BANNER_MESSAGE_LENGTH,
} from "@/lib/platform-banner";

export const runtime = "nodejs";

const createSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(MAX_BANNER_MESSAGE_LENGTH),
  expiresInHours: z.coerce
    .number()
    .positive("Duration must be greater than 0")
    .max(MAX_BANNER_DURATION_HOURS, `Duration is capped at ${MAX_BANNER_DURATION_HOURS} hours`),
});

/** GET /api/admin/platform-banner — recent banners for the admin panel. */
export async function GET() {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const broadcasts = await listPlatformBroadcasts(50);
    return NextResponse.json({ broadcasts });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/admin/platform-banner — publish a new site-wide banner. */
export async function POST(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    const broadcast = await createPlatformBroadcast({
      message: parsed.data.message,
      expiresInHours: parsed.data.expiresInHours,
    });

    return NextResponse.json({ broadcast }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

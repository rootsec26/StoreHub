import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { createBroadcastSchema, adminListQuerySchema } from "@/lib/messaging/schemas";
import {
  createAdminBroadcast,
  listAdminBroadcasts,
} from "@/lib/messaging/service";
import {
  clientIp,
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

const broadcastLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "admin-broadcast",
  message: "Too many broadcast requests. Please wait a minute.",
});

/** GET /api/admin/broadcasts — platform broadcast history. */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const parsed = adminListQuerySchema.safeParse({
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
      storeId: params.get("storeId") ?? undefined,
      search: params.get("search") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const result = await listAdminBroadcasts({
      page: parsed.data.page,
      limit: parsed.data.limit,
      search: parsed.data.search,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/admin/broadcasts — send an in-app announcement to merchants. */
export async function POST(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const limited = await broadcastLimiter(request);
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const parsed = createBroadcastSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    const session = await getSession();
    const campaign = await createAdminBroadcast({
      userId: session?.id ?? null,
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      priority: parsed.data.priority,
      audienceType: parsed.data.audienceType,
      audienceFilter: parsed.data.audienceFilter,
      expiresAt: parsed.data.expiresAt,
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

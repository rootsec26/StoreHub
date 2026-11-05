import { NextRequest, NextResponse } from "next/server";

import { createRateLimiter } from "@/lib/rate-limit";
import { createCampaignSchema, listQuerySchema } from "@/lib/messaging/schemas";
import {
  createMerchantCampaign,
  dispatchBatch,
  listCampaigns,
} from "@/lib/messaging/service";
import {
  clientIp,
  errorResponse,
  requireMerchantContext,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

const sendLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "notifications-send",
  message: "Too many message requests. Please wait a minute and try again.",
});

/** GET /api/notifications — the merchant's campaign history + summary. */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireMerchantContext();
    const params = request.nextUrl.searchParams;

    const parsed = listQuerySchema.safeParse({
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
      status: params.get("status") ?? undefined,
      search: params.get("search") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const result = await listCampaigns(storeId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/notifications — create (and optionally start sending) a campaign. */
export async function POST(request: NextRequest) {
  try {
    const limited = await sendLimiter(request);
    if (limited) return limited;

    const { session, storeId } = await requireMerchantContext();

    const body = await request.json().catch(() => null);
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    const campaign = await createMerchantCampaign({
      storeId,
      userId: session.id,
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      priority: parsed.data.priority,
      audienceType: parsed.data.audienceType,
      audienceFilter: parsed.data.audienceFilter,
      scheduledAt: parsed.data.scheduledAt,
      ipAddress: clientIp(request),
    });

    const send =
      parsed.data.sendNow && campaign.recipientCount > 0
        ? await dispatchBatch(storeId, campaign.id, {
            actorUserId: session.id,
            ipAddress: clientIp(request),
          })
        : null;

    return NextResponse.json({ campaign, send }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

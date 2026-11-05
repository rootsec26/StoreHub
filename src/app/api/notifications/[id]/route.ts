import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createRateLimiter } from "@/lib/rate-limit";
import { campaignActionSchema } from "@/lib/messaging/schemas";
import {
  cancelCampaign,
  dispatchBatch,
  getCampaign,
  listRecipients,
  resetFailedRecipients,
} from "@/lib/messaging/service";
import {
  clientIp,
  errorResponse,
  requireMerchantContext,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const idSchema = z.string().uuid();
const recipientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
});

const sendLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "notifications-batch",
  message: "Too many send requests. Please wait a moment.",
});

/** GET /api/notifications/[id] — campaign detail + recipient delivery log. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { storeId } = await requireMerchantContext();
    const { id } = await params;

    if (!idSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid campaign id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const query = request.nextUrl.searchParams;
    const parsed = recipientQuerySchema.safeParse({
      page: query.get("page") ?? undefined,
      limit: query.get("limit") ?? undefined,
      status: query.get("status") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const [campaign, recipients] = await Promise.all([
      getCampaign(storeId, id),
      listRecipients(id, parsed.data),
    ]);

    return NextResponse.json({ campaign, ...recipients });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/notifications/[id] — send next batch, retry failures, cancel. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { session, storeId } = await requireMerchantContext();
    const { id } = await params;

    if (!idSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid campaign id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = campaignActionSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    if (parsed.data.action === "cancel") {
      const campaign = await cancelCampaign(
        storeId,
        id,
        session.id,
        clientIp(request)
      );
      return NextResponse.json({ campaign });
    }

    const limited = await sendLimiter(request);
    if (limited) return limited;

    if (parsed.data.action === "retry") {
      await resetFailedRecipients(storeId, id);
    }

    const send = await dispatchBatch(storeId, id, {
      actorUserId: session.id,
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ send });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminCampaign, listRecipients } from "@/lib/messaging/service";
import {
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/broadcasts/[id] — announcement + per-merchant read log. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid broadcast id", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const search = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      page: search.get("page") ?? undefined,
      limit: search.get("limit") ?? undefined,
      status: search.get("status") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const [campaign, recipients] = await Promise.all([
      getAdminCampaign("ADMIN_TO_MERCHANT", id),
      listRecipients(id, parsed.data),
    ]);

    return NextResponse.json({ campaign, ...recipients });
  } catch (error) {
    return errorResponse(error);
  }
}

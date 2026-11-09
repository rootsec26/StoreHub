import { NextRequest, NextResponse } from "next/server";

import { adminListQuerySchema } from "@/lib/messaging/schemas";
import { listAdminMessageRecipients } from "@/lib/messaging/service";
import {
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/admin/messages/recipients — individual message delivery log. */
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

    const status = params.get("status")?.trim() || undefined;
    const result = await listAdminMessageRecipients({
      page: parsed.data.page,
      limit: parsed.data.limit,
      storeId: parsed.data.storeId,
      search: parsed.data.search,
      status,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

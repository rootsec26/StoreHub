import { NextRequest, NextResponse } from "next/server";

import { adminUsersQuerySchema } from "@/lib/messaging/schemas";
import { listAdminUsers } from "@/lib/messaging/service";
import {
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/users?tab=all|recent&days=7
 * The Recent tab is a subset; the All tab stays unfiltered so new users remain
 * visible there with a "new" badge.
 */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const parsed = adminUsersQuerySchema.safeParse({
      tab: params.get("tab") ?? undefined,
      days: params.get("days") ?? undefined,
      q: params.get("q") ?? undefined,
      plan: params.get("plan") ?? undefined,
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const result = await listAdminUsers(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";

import { getAdminOverview } from "@/lib/messaging/service";
import { denyAdmin, errorResponse } from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/admin/overview — platform KPI cards. */
export async function GET() {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const stats = await getAdminOverview();
    return NextResponse.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}

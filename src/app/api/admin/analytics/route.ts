import { NextRequest, NextResponse } from "next/server";

import { getAdminAnalytics } from "@/lib/admin-analytics";
import type { AdminAnalyticsPeriod } from "@/lib/admin-analytics-types";
import { denyAdmin } from "@/lib/messaging/server";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

/** GET /api/admin/analytics?period=daily|weekly */
export async function GET(request: NextRequest) {
  const denied = await denyAdmin();
  if (denied) return denied;

  try {
    const periodParam = request.nextUrl.searchParams.get("period");
    const period: AdminAnalyticsPeriod = periodParam === "weekly" ? "weekly" : "daily";
    const analytics = await getAdminAnalytics(period);
    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Get admin analytics error:", error);
    return createErrorResponse(error, "Failed to fetch admin analytics");
  }
}

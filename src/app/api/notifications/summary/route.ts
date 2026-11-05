import { NextResponse } from "next/server";

import { getSessionWithStore } from "@/lib/auth";
import { getNotificationSummary } from "@/lib/messaging/service";
import { errorResponse } from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/notifications/summary — unread badge + campaign counters. */
export async function GET() {
  try {
    const session = await getSessionWithStore();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const summary = await getNotificationSummary(
      session.id,
      session.storeId ?? null
    );
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}

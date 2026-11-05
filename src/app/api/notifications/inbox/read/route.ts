import { NextRequest, NextResponse } from "next/server";

import { inboxReadSchema } from "@/lib/messaging/schemas";
import { markInboxRead } from "@/lib/messaging/service";
import {
  errorResponse,
  requireSession,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/** POST /api/notifications/inbox/read — mark one, many, or all as read. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json().catch(() => null);
    const parsed = inboxReadSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    const updated = await markInboxRead(session.id, parsed.data);
    return NextResponse.json({ updated });
  } catch (error) {
    return errorResponse(error);
  }
}

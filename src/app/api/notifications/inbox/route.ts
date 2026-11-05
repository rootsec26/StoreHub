import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getInbox } from "@/lib/messaging/service";
import {
  errorResponse,
  requireSession,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  unreadOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((value) => value === true || value === "true" || value === "1"),
});

/** GET /api/notifications/inbox — admin announcements received by this merchant. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const params = request.nextUrl.searchParams;

    const parsed = inboxQuerySchema.safeParse({
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
      unreadOnly: params.get("unreadOnly") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    const inbox = await getInbox(session.id, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      unreadOnly: parsed.data.unreadOnly,
    });

    return NextResponse.json(inbox);
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  denyAdmin,
  errorResponse,
  validationResponse,
} from "@/lib/messaging/server";
import {
  deletePlatformBroadcast,
  setPlatformBroadcastActive,
} from "@/lib/platform-banner";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
const patchSchema = z.object({
  isActive: z.boolean(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/platform-banner/[id] — publish/unpublish a banner. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationResponse(parsed.error);

    const broadcast = await setPlatformBroadcastActive(id, parsed.data.isActive);
    if (!broadcast) {
      return NextResponse.json(
        { error: "Broadcast not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ broadcast });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/admin/platform-banner/[id] — remove a banner instantly. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
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

    const deleted = await deletePlatformBroadcast(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Broadcast not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

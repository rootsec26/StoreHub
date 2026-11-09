import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { storeReviews } from "@/db/schema";
import { isValidUuid } from "@/lib/storefront";
import {
  denyAdmin,
  errorResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** DELETE /api/admin/reviews/[id] — remove an inappropriate review. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid review id", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(storeReviews)
      .where(eq(storeReviews.id, id))
      .returning({ id: storeReviews.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Review not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

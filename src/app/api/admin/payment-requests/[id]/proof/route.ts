import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";

/**
 * GET /api/admin/payment-requests/[id]/proof
 * Admin-only: returns the proof data URL for ONE request. Proofs are kept
 * out of every list query and served only through this authenticated route.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !isAdminEmail(session.email)) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const rows = await db
      .select({ proofData: paymentRequests.proofData })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);

    const proofData = rows[0]?.proofData ?? "";
    if (!proofData) {
      return NextResponse.json(
        { error: "No proof uploaded", code: "NO_PROOF" },
        { status: 404 }
      );
    }

    return NextResponse.json({ proofData });
  } catch (error) {
    console.error("[admin] payment-request proof failed:", error);
    return createErrorResponse(error, "Failed to load proof");
  }
}

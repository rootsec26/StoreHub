import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { withRateLimit, authRateLimiter } from "@/lib/rate-limit";
import { isAllowedProofDataUrl } from "@/lib/billing-plans";

/**
 * GET  /api/billing/payment-requests/[id]/proof → owner reads back their
 *      own proof data URL (admins use the admin proof endpoint).
 * POST /api/billing/payment-requests/[id]/proof
 * Attaches a compressed proof image (data URL) to the caller's own
 * pending request. Proofs live in `proof_data` — reachable only through
 * owner/admin-authenticated routes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const rows = await db
      .select({
        userId: paymentRequests.userId,
        proofData: paymentRequests.proofData,
      })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);
    const req = rows[0];
    if (!req || req.userId !== session.id) {
      return NextResponse.json(
        { error: "Request not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    if (!req.proofData) {
      return NextResponse.json(
        { error: "No proof uploaded", code: "NO_PROOF" },
        { status: 404 }
      );
    }
    return NextResponse.json({ proofData: req.proofData });
  } catch (error) {
    console.error("[billing] proof read failed:", error);
    return createErrorResponse(error, "Failed to load proof");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await withRateLimit(request, authRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      proofData?: unknown;
    } | null;
    const proofData =
      typeof body?.proofData === "string" ? body.proofData : "";

    if (!isAllowedProofDataUrl(proofData)) {
      return NextResponse.json(
        { error: "Invalid proof file", code: "INVALID_PROOF" },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id))
      .limit(1);
    const req = rows[0];
    if (!req || req.userId !== session.id) {
      return NextResponse.json(
        { error: "Request not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    if (req.status !== "pending") {
      return NextResponse.json(
        { error: "Request is not pending", code: "NOT_PENDING" },
        { status: 409 }
      );
    }

    await db
      .update(paymentRequests)
      .set({ proofData })
      .where(eq(paymentRequests.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[billing] proof upload failed:", error);
    return createErrorResponse(error, "Failed to upload proof");
  }
}

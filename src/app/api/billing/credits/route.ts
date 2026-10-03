import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/billing/credits
 *
 * Instant / free credit top-ups are disabled. Credits are only granted by
 * redeeming a paid activation code through POST /api/billing/redeem-code.
 * Body: { creditType: "ai" | "whatsapp", packageId: string }
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      error:
        "Credit packages are paid. Transfer the amount, then redeem your activation code from Billing.",
      code: "PAYMENT_REQUIRED",
    },
    { status: 402 }
  );
}

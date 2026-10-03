import { NextRequest, NextResponse } from "next/server";

import { generateProductDescription } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  canUseAICredits,
  getStoreIdForOwner,
  PaywallError,
  recordCreditUsage,
} from "@/lib/paywall";

export const runtime = "nodejs";

/**
 * POST /api/ai/description
 * Generates a persuasive Arabic product description from a name + keywords.
 * Requires an authenticated merchant session and spends 1 AI credit.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const keywords = typeof body?.keywords === "string" ? body.keywords.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required", code: "MISSING_NAME" },
        { status: 400 }
      );
    }
    if (name.length > 200 || keywords.length > 600) {
      return NextResponse.json(
        { error: "Input is too long", code: "INPUT_TOO_LONG" },
        { status: 400 }
      );
    }

    const storeId = session.storeId ?? (await getStoreIdForOwner(session.id));
    if (!storeId) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    let creditsRemaining: number | null = null;
    try {
      creditsRemaining = await canUseAICredits(storeId, 1);
    } catch (error) {
      if (error instanceof PaywallError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status }
        );
      }
      throw error;
    }

    const result = await generateProductDescription({ name, keywords });

    await recordCreditUsage(storeId, "ai", 1, creditsRemaining, "AI product description");

    return NextResponse.json({
      description: result.text,
      source: result.source,
      ...(creditsRemaining !== null ? { creditsRemaining } : {}),
    });
  } catch (error) {
    console.error("AI description error:", error);
    return createErrorResponse(error, "Failed to generate description");
  }
}

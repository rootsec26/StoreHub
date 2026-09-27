import { NextRequest, NextResponse } from "next/server";

import { generateProductDescription } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/ai/description
 * Generates a persuasive Arabic product description from a name + keywords.
 * Requires an authenticated merchant session.
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

    const result = await generateProductDescription({ name, keywords });

    return NextResponse.json({
      description: result.text,
      source: result.source,
    });
  } catch (error) {
    console.error("AI description error:", error);
    return createErrorResponse(error, "Failed to generate description");
  }
}

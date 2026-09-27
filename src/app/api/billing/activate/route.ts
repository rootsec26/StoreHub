import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";

import { db } from "@/db";
import { activationCodes, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizePlan } from "@/lib/plans";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Activation code is required", code: "MISSING_CODE" }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();

    const codeRecord = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.code, normalizedCode))
      .limit(1);

    if (codeRecord.length === 0) {
      return NextResponse.json({ error: "Invalid activation code", code: "INVALID_CODE" }, { status: 400 });
    }

    const activationCode = codeRecord[0];

    if (!activationCode.isActive) {
      return NextResponse.json({ error: "This activation code has been deactivated", code: "CODE_DEACTIVATED" }, { status: 400 });
    }

    if (activationCode.timesUsed >= activationCode.maxUses) {
      return NextResponse.json({ error: "This activation code has reached its usage limit", code: "CODE_LIMIT_REACHED" }, { status: 400 });
    }

    if (activationCode.expiresAt && new Date(activationCode.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This activation code has expired", code: "CODE_EXPIRED" }, { status: 400 });
    }

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const plan = normalizePlan(activationCode.plan);

    await db.update(stores).set({ plan }).where(eq(stores.id, store[0].id));

    await db
      .update(activationCodes)
      .set({ timesUsed: activationCode.timesUsed + 1 })
      .where(eq(activationCodes.id, activationCode.id));

    return NextResponse.json({
      success: true,
      plan,
      message: "Plan activated successfully",
    });
  } catch (error) {
    console.error("Activate plan error:", error);
    return createErrorResponse(error, "Failed to activate plan");
  }
}
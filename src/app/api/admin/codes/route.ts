import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { activationCodes } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isLocalhostRequest } from "@/lib/admin";
import {
  ACTIVATION_CODE_SPECS,
  isActivationCodeType,
  type ActivationCodeType,
} from "@/lib/billing-packages";
import {
  activationCodeLabel,
  activationCodeStatus,
  generateActivationCode,
  isCustomCodeValid,
  type ActivationCodeDTO,
} from "@/lib/activation-codes";

export const runtime = "nodejs";

const DEFAULT_VALIDITY_DAYS = 90;
const MAX_BATCH = 100;
const MAX_VALIDITY_DAYS = 3650;

type CodeRow = typeof activationCodes.$inferSelect;

function toDTO(row: CodeRow): ActivationCodeDTO {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    label: activationCodeLabel(row.type),
    creditAmount: row.creditAmount,
    planDays: row.planDays,
    status: activationCodeStatus(row),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
    usedByStoreId: row.usedByStoreId,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

async function requireLocalhost() {
  if (await isLocalhostRequest()) return null;
  return NextResponse.json(
    { error: "Not found", code: "NOT_FOUND" },
    { status: 404 }
  );
}

/** GET /api/admin/codes — every generated voucher with its status. */
export async function GET() {
  const denied = await requireLocalhost();
  if (denied) return denied;

  try {
    const rows = await db
      .select()
      .from(activationCodes)
      .orderBy(desc(activationCodes.createdAt))
      .limit(500);

    return NextResponse.json({ codes: rows.map(toDTO) });
  } catch (error) {
    console.error("List activation codes error:", error);
    return createErrorResponse(error, "Failed to list activation codes");
  }
}

/**
 * POST /api/admin/codes
 * Body: { type: ActivationCodeType, quantity?: 1..100, validDays?: 1..3650, customCode?: string }
 * Generates single or batch vouchers the operator sends to merchants.
 */
export async function POST(request: NextRequest) {
  const denied = await requireLocalhost();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    const type = body?.type;

    if (!isActivationCodeType(type)) {
      return NextResponse.json(
        { error: "Unknown voucher type", code: "INVALID_TYPE" },
        { status: 400 }
      );
    }

    const spec = ACTIVATION_CODE_SPECS[type as ActivationCodeType];
    const quantityRaw = Number(body?.quantity ?? 1);
    const quantity = Number.isInteger(quantityRaw) ? quantityRaw : 0;
    if (quantity < 1 || quantity > MAX_BATCH) {
      return NextResponse.json(
        { error: `Quantity must be between 1 and ${MAX_BATCH}`, code: "INVALID_QUANTITY" },
        { status: 400 }
      );
    }

    const validDaysRaw = Number(body?.validDays ?? DEFAULT_VALIDITY_DAYS);
    const validDays = Number.isInteger(validDaysRaw) ? validDaysRaw : 0;
    if (validDays < 1 || validDays > MAX_VALIDITY_DAYS) {
      return NextResponse.json(
        { error: "Validity must be between 1 and 3650 days", code: "INVALID_VALIDITY" },
        { status: 400 }
      );
    }

    const customCode =
      typeof body?.customCode === "string"
        ? body.customCode.trim().toUpperCase()
        : "";

    if (customCode && quantity !== 1) {
      return NextResponse.json(
        { error: "A custom code can only be created one at a time", code: "INVALID_QUANTITY" },
        { status: 400 }
      );
    }
    if (customCode && !isCustomCodeValid(customCode)) {
      return NextResponse.json(
        { error: "Custom code must be 4-24 characters (A-Z, 0-9, dashes)", code: "INVALID_CODE" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    // Build a batch, avoiding collisions with codes already in the database.
    const generated: string[] = [];
    if (customCode) {
      const existing = await db
        .select({ code: activationCodes.code })
        .from(activationCodes)
        .where(eq(activationCodes.code, customCode))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "That code already exists", code: "DUPLICATE_CODE" },
          { status: 409 }
        );
      }
      generated.push(customCode);
    } else {
      for (let attempt = 0; attempt < 8 && generated.length < quantity; attempt++) {
        const needed = quantity - generated.length;
        const candidates = Array.from({ length: needed }, () =>
          generateActivationCode(spec.prefix)
        );
        const unique = [...new Set([...generated, ...candidates])].slice(
          0,
          quantity
        );
        const existing = await db
          .select({ code: activationCodes.code })
          .from(activationCodes)
          .where(inArray(activationCodes.code, unique));
        const taken = new Set(existing.map((row) => row.code));
        for (const candidate of unique) {
          if (generated.length >= quantity) break;
          if (!taken.has(candidate) && !generated.includes(candidate)) {
            generated.push(candidate);
          }
        }
      }

      if (generated.length < quantity) {
        return NextResponse.json(
          { error: "Failed to generate unique codes", code: "GENERATION_FAILED" },
          { status: 500 }
        );
      }
    }

    const inserted = await db
      .insert(activationCodes)
      .values(
        generated.map((code) => ({
          code,
          type,
          creditAmount: spec.creditAmount,
          planDays: spec.planDays,
          isUsed: false,
          expiresAt,
        }))
      )
      .returning();

    return NextResponse.json({
      created: inserted.length,
      codes: inserted.map(toDTO),
    });
  } catch (error) {
    console.error("Generate activation codes error:", error);
    return createErrorResponse(error, "Failed to generate activation codes");
  }
}

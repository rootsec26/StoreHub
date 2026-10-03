import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, loyaltySettings, stores, vipTiers } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import {
  normalizeLoyaltyPhone,
  settingsRecordFromRow,
  tierRecordFromRow,
  type StorefrontLoyaltyPayload,
} from "@/lib/loyalty";

export const runtime = "nodejs";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveStore(params: URLSearchParams) {
  const storeId = asText(params.get("storeId"));
  const slug = asText(params.get("slug"));

  if (storeId) {
    const rows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    return rows[0];
  }
  if (slug) {
    const rows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);
    return rows[0];
  }
  return undefined;
}

/**
 * Public storefront lookup: `GET /api/storefront/loyalty?storeId=…&phone=…`
 * Answers the checkout widget with the member's balance, VIP tier rules and
 * the earning/redemption settings. Members are identified by store + phone
 * (the storefront has no separate customer login).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const store = await resolveStore(params);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const settingRows = await db
      .select()
      .from(loyaltySettings)
      .where(eq(loyaltySettings.storeId, store.id))
      .limit(1);

    const settingsRow = settingRows[0];
    if (!settingsRow || !settingsRow.isEnabled) {
      const payload: StorefrontLoyaltyPayload = {
        enabled: false,
        settings: null,
        profile: null,
        tiers: [],
      };
      return NextResponse.json(payload);
    }

    const tierRows = await db
      .select()
      .from(vipTiers)
      .where(eq(vipTiers.storeId, store.id))
      .orderBy(asc(vipTiers.minSpendThreshold));

    const phone = normalizeLoyaltyPhone(params.get("phone"));
    let profile: StorefrontLoyaltyPayload["profile"] = null;

    if (phone) {
      const memberRows = await db
        .select()
        .from(customers)
        .where(
          and(eq(customers.storeId, store.id), eq(customers.phone, phone))
        )
        .limit(1);

      const member = memberRows[0];
      if (member) {
        profile = {
          customerId: member.id,
          name: member.name || "",
          points: member.loyaltyPoints,
          totalLifetimeSpend: Number(member.totalLifetimeSpend) || 0,
        };
      }
    }

    const settings = settingsRecordFromRow(settingsRow);
    const payload: StorefrontLoyaltyPayload = {
      enabled: true,
      settings: {
        pointsPerAmount: settings.pointsPerAmount,
        redemptionRate: settings.redemptionRate,
        signupBonusPoints: settings.signupBonusPoints,
      },
      profile,
      tiers: tierRows.map(tierRecordFromRow),
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Storefront loyalty lookup error:", error);
    return createErrorResponse(error, "Failed to load loyalty profile");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  loyaltySettings,
  loyaltyTransactions,
  stores,
  vipTiers,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import {
  DEFAULT_LOYALTY_SETTINGS,
  DEFAULT_VIP_TIERS,
  settingsRecordFromRow,
  tierRecordFromRow,
  type LoyaltyActivityRow,
  type LoyaltyLedgerRow,
  type LoyaltySettingsRecord,
  type LoyaltySummary,
  type VipTierRecord,
} from "@/lib/loyalty";
import { validateRequest, loyaltyAdjustmentSchema, formatZodError } from "@/lib/validators";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id, slug: stores.slug })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

/**
 * First-load bootstrap: every store gets an editable settings row plus the
 * four default VIP tiers (Bronze / Silver / Gold / VIP) so the dashboard and
 * checkout never operate on an empty program.
 */
async function ensureProgram(storeId: string): Promise<{
  settings: LoyaltySettingsRecord;
  tiers: VipTierRecord[];
}> {
  const settingRows = await db
    .select()
    .from(loyaltySettings)
    .where(eq(loyaltySettings.storeId, storeId))
    .limit(1);

  let settingsRow = settingRows[0];
  if (!settingsRow) {
    const inserted = await db
      .insert(loyaltySettings)
      .values({
        storeId,
        pointsPerAmount: String(DEFAULT_LOYALTY_SETTINGS.pointsPerAmount),
        redemptionRate: String(DEFAULT_LOYALTY_SETTINGS.redemptionRate),
        signupBonusPoints: DEFAULT_LOYALTY_SETTINGS.signupBonusPoints,
        isEnabled: DEFAULT_LOYALTY_SETTINGS.isEnabled,
      })
      .onConflictDoNothing({ target: [loyaltySettings.storeId] })
      .returning();
    if (inserted[0]) {
      settingsRow = inserted[0];
    } else {
      const rerows = await db
        .select()
        .from(loyaltySettings)
        .where(eq(loyaltySettings.storeId, storeId))
        .limit(1);
      settingsRow = rerows[0];
    }
  }

  let tierRows = await db
    .select()
    .from(vipTiers)
    .where(eq(vipTiers.storeId, storeId))
    .orderBy(asc(vipTiers.minSpendThreshold));

  if (tierRows.length === 0) {
    await db.insert(vipTiers).values(
      DEFAULT_VIP_TIERS.map((tier) => ({
        storeId,
        tierName: tier.tierName,
        minSpendThreshold: tier.minSpendThreshold.toFixed(2),
        discountPercentage: tier.discountPercentage.toFixed(2),
        freeShippingUnlocked: tier.freeShippingUnlocked,
        badgeColor: tier.badgeColor,
      }))
    );
    tierRows = await db
      .select()
      .from(vipTiers)
      .where(eq(vipTiers.storeId, storeId))
      .orderBy(asc(vipTiers.minSpendThreshold));
  }

  if (!settingsRow) {
    // Fallback: return default values so the page doesn't crash
    return {
      settings: {
        id: "",
        storeId: "",
        pointsPerAmount: 10,
        redemptionRate: 10,
        signupBonusPoints: 100,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as LoyaltySettingsRecord,
      tiers: DEFAULT_VIP_TIERS.map((tier) => ({
        id: "",
        storeId: storeId,
        tierName: tier.tierName,
        minSpendThreshold: tier.minSpendThreshold,
        discountPercentage: tier.discountPercentage,
        freeShippingUnlocked: tier.freeShippingUnlocked,
        badgeColor: tier.badgeColor,
      } as VipTierRecord)),
    };
  }

  return {
    settings: settingsRecordFromRow(settingsRow),
    tiers: tierRows.map(tierRecordFromRow),
  };
}

/**
 * GET /api/loyalty            -> settings + tiers + customer ledger (admin)
 * GET /api/loyalty?summary=1  -> lightweight badge counters for the sidebar
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (request.nextUrl.searchParams.get("summary") === "1") {
      const settingRows = await db
        .select({ isEnabled: loyaltySettings.isEnabled })
        .from(loyaltySettings)
        .where(eq(loyaltySettings.storeId, store.id))
        .limit(1);

      const memberRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(eq(customers.storeId, store.id));

      const summary: LoyaltySummary = {
        members: Number(memberRows[0]?.count) || 0,
        outstandingPoints: 0,
        totalEarned: 0,
        totalRedeemed: 0,
        enabled: settingRows[0]?.isEnabled ?? false,
      };
      return NextResponse.json({ summary });
    }

    const { settings, tiers } = await ensureProgram(store.id);

    const ledgerRows = await db
      .select({
        customerId: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        points: customers.loyaltyPoints,
        totalLifetimeSpend: customers.totalLifetimeSpend,
        tierId: vipTiers.id,
        tierName: vipTiers.tierName,
        tierBadgeColor: vipTiers.badgeColor,
        tierDiscount: vipTiers.discountPercentage,
        tierFreeShipping: vipTiers.freeShippingUnlocked,
        tierThreshold: vipTiers.minSpendThreshold,
        earned: sql<number>`coalesce(sum(case when ${loyaltyTransactions.points} > 0 then ${loyaltyTransactions.points} else 0 end), 0)::int`,
        redeemed: sql<number>`coalesce(sum(case when ${loyaltyTransactions.points} < 0 then -${loyaltyTransactions.points} else 0 end), 0)::int`,
      })
      .from(customers)
      .leftJoin(vipTiers, eq(customers.currentVipTierId, vipTiers.id))
      .leftJoin(
        loyaltyTransactions,
        eq(loyaltyTransactions.customerId, customers.id)
      )
      .where(eq(customers.storeId, store.id))
      .groupBy(customers.id, vipTiers.id)
      .orderBy(desc(customers.totalLifetimeSpend));

    const ledger: LoyaltyLedgerRow[] = ledgerRows.map((row) => ({
      customerId: row.customerId,
      name: row.name || "",
      phone: row.phone,
      email: row.email || "",
      points: Number(row.points) || 0,
      totalLifetimeSpend: Number(row.totalLifetimeSpend) || 0,
      earned: Number(row.earned) || 0,
      redeemed: Number(row.redeemed) || 0,
      tier:
        row.tierName && row.tierId
          ? {
              id: row.tierId,
              storeId: store.id,
              tierName: row.tierName,
              minSpendThreshold: Number(row.tierThreshold) || 0,
              discountPercentage: Number(row.tierDiscount) || 0,
              freeShippingUnlocked: Boolean(row.tierFreeShipping),
              badgeColor: row.tierBadgeColor ?? "",
            }
          : null,
    }));

    const activityRows = await db
      .select({
        id: loyaltyTransactions.id,
        customerId: loyaltyTransactions.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        points: loyaltyTransactions.points,
        type: loyaltyTransactions.type,
        balanceAfter: loyaltyTransactions.balanceAfter,
        description: loyaltyTransactions.description,
        createdAt: sql<string>`${loyaltyTransactions.createdAt}::text`,
      })
      .from(loyaltyTransactions)
      .innerJoin(customers, eq(loyaltyTransactions.customerId, customers.id))
      .where(eq(loyaltyTransactions.storeId, store.id))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(15);

    const activity: LoyaltyActivityRow[] = activityRows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName || "",
      customerPhone: row.customerPhone || "",
      points: Number(row.points) || 0,
      type: row.type,
      balanceAfter: Number(row.balanceAfter) || 0,
      description: row.description || "",
      createdAt: row.createdAt,
    }));

    const outstandingPoints = ledger.reduce((sum, row) => sum + row.points, 0);
    const totalEarned = ledger.reduce((sum, row) => sum + row.earned, 0);
    const totalRedeemed = ledger.reduce((sum, row) => sum + row.redeemed, 0);

    const summary: LoyaltySummary = {
      members: ledger.length,
      outstandingPoints,
      totalEarned,
      totalRedeemed,
      enabled: settings.isEnabled,
    };

    return NextResponse.json({ settings, tiers, ledger, activity, summary });
  } catch (error) {
    console.error("Loyalty API Error:", error);
    // Safe fallback with HTTP 200 so the dashboard still renders
    // even when the database is unreachable or tables are missing.
    return NextResponse.json(
      {
        success: true,
        settings: null,
        tiers: [],
        ledger: [],
        activity: [],
        points: 0,
        history: [],
        summary: {
          members: 0,
          outstandingPoints: 0,
          totalEarned: 0,
          totalRedeemed: 0,
          enabled: false,
        },
      },
      { status: 200 }
    );
  }
}

/** PATCH /api/loyalty — update the settings row or a single VIP tier. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const type = typeof body.type === "string" ? body.type : "";

    if (type === "settings") {
      await ensureProgram(store.id);

      const values: Partial<typeof loyaltySettings.$inferInsert> = {};

      if (body.pointsPerAmount !== undefined) {
        const rate = Number(body.pointsPerAmount);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
          return NextResponse.json(
            { error: "Amount per point must be greater than 0", code: "INVALID_POINTS_PER_AMOUNT" },
            { status: 400 }
          );
        }
        values.pointsPerAmount = rate.toFixed(2);
      }

      if (body.redemptionRate !== undefined) {
        const rate = Number(body.redemptionRate);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
          return NextResponse.json(
            { error: "Redemption rate must be greater than 0", code: "INVALID_REDEMPTION_RATE" },
            { status: 400 }
          );
        }
        values.redemptionRate = rate.toFixed(2);
      }

      if (body.signupBonusPoints !== undefined) {
        const bonus = Math.floor(Number(body.signupBonusPoints));
        if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1000000) {
          return NextResponse.json(
            { error: "Signup bonus must be between 0 and 1,000,000", code: "INVALID_SIGNUP_BONUS" },
            { status: 400 }
          );
        }
        values.signupBonusPoints = bonus;
      }

      if (body.isEnabled !== undefined) {
        values.isEnabled = Boolean(body.isEnabled);
      }

      if (Object.keys(values).length === 0) {
        return NextResponse.json(
          { error: "No settings provided", code: "EMPTY_PATCH" },
          { status: 400 }
        );
      }

      values.updatedAt = new Date();

      const updated = await db
        .update(loyaltySettings)
        .set(values)
        .where(eq(loyaltySettings.storeId, store.id))
        .returning();

      if (updated.length === 0) {
        const inserted = await db
          .insert(loyaltySettings)
          .values({
            storeId: store.id,
            pointsPerAmount: String(DEFAULT_LOYALTY_SETTINGS.pointsPerAmount),
            redemptionRate: String(DEFAULT_LOYALTY_SETTINGS.redemptionRate),
            signupBonusPoints: DEFAULT_LOYALTY_SETTINGS.signupBonusPoints,
            isEnabled: DEFAULT_LOYALTY_SETTINGS.isEnabled,
            ...values,
          })
          .onConflictDoNothing({ target: [loyaltySettings.storeId] })
          .returning();
        if (inserted[0]) {
          return NextResponse.json({
            settings: settingsRecordFromRow(inserted[0]),
          });
        }
        const rerows = await db
          .select()
          .from(loyaltySettings)
          .where(eq(loyaltySettings.storeId, store.id))
          .limit(1);
        if (!rerows[0]) {
          return NextResponse.json(
            { error: "Settings not found", code: "NOT_FOUND" },
            { status: 404 }
          );
        }
        return NextResponse.json({
          settings: settingsRecordFromRow(rerows[0]),
        });
      }

      return NextResponse.json({
        settings: settingsRecordFromRow(updated[0]),
      });
    }

    if (type === "tier") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json(
          { error: "Tier id is required", code: "MISSING_ID" },
          { status: 400 }
        );
      }

      const values: Partial<typeof vipTiers.$inferInsert> = {};

      if (body.tierName !== undefined) {
        const name = String(body.tierName).trim().slice(0, 40);
        if (!name) {
          return NextResponse.json(
            { error: "Tier name is required", code: "INVALID_TIER_NAME" },
            { status: 400 }
          );
        }
        values.tierName = name;
      }

      if (body.minSpendThreshold !== undefined) {
        const threshold = Number(body.minSpendThreshold);
        if (!Number.isFinite(threshold) || threshold < 0) {
          return NextResponse.json(
            { error: "Spend threshold must be 0 or more", code: "INVALID_THRESHOLD" },
            { status: 400 }
          );
        }
        values.minSpendThreshold = threshold.toFixed(2);
      }

      if (body.discountPercentage !== undefined) {
        const discount = Number(body.discountPercentage);
        if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
          return NextResponse.json(
            { error: "Discount must be between 0 and 100", code: "INVALID_DISCOUNT" },
            { status: 400 }
          );
        }
        values.discountPercentage = discount.toFixed(2);
      }

      if (body.freeShippingUnlocked !== undefined) {
        values.freeShippingUnlocked = Boolean(body.freeShippingUnlocked);
      }

      if (body.badgeColor !== undefined) {
        const color = String(body.badgeColor).trim();
        if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) {
          return NextResponse.json(
            { error: "Badge color must be a hex color like #7C3AED", code: "INVALID_BADGE_COLOR" },
            { status: 400 }
          );
        }
        values.badgeColor = color;
      }

      if (Object.keys(values).length === 0) {
        return NextResponse.json(
          { error: "No tier changes provided", code: "EMPTY_PATCH" },
          { status: 400 }
        );
      }

      const updated = await db
        .update(vipTiers)
        .set(values)
        .where(and(eq(vipTiers.id, id), eq(vipTiers.storeId, store.id)))
        .returning();

      if (updated.length === 0) {
        return NextResponse.json(
          { error: "Tier not found", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      return NextResponse.json({ tier: tierRecordFromRow(updated[0]) });
    }

    return NextResponse.json(
      { error: "Unknown patch type", code: "INVALID_TYPE" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Loyalty API Error:", error);
    // Never surface HTTP 500 — return 200 with a safe no-op payload.
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update loyalty program",
        code: "SERVER_ERROR",
        settings: null,
        tier: null,
      },
      { status: 200 }
    );
  }
}

/** POST /api/loyalty — manual `+ Add Points` / `- Deduct Points` adjustment. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateRequest(loyaltyAdjustmentSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }
    const { customerId, action, points: requested, note } = validation.data;

    const memberRows = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, customerId), eq(customers.storeId, store.id))
      )
      .limit(1);

    const member = memberRows[0];
    if (!member) {
      return NextResponse.json(
        { error: "Customer not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const balance = member.loyaltyPoints;
    const delta =
      action === "add" ? requested : -Math.min(requested, balance);

    if (delta === 0) {
      return NextResponse.json(
        { error: "This customer has no points to deduct", code: "NO_POINTS" },
        { status: 400 }
      );
    }

    const newBalance = Math.max(0, balance + delta);

    // Wrap balance update and transaction log in atomic transaction
    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ loyaltyPoints: newBalance, updatedAt: new Date() })
        .where(
          and(eq(customers.id, customerId), eq(customers.storeId, store.id))
        );

      await tx.insert(loyaltyTransactions).values({
        storeId: store.id,
        customerId,
        points: delta,
        type: "adjustment",
        balanceAfter: newBalance,
        description:
          note || (delta > 0 ? "Manual points grant" : "Manual points deduction"),
      });
    });

    return NextResponse.json({
      customer: {
        customerId,
        points: newBalance,
      },
      delta,
    });
  } catch (error) {
    console.error("Loyalty API Error:", error);
    return createErrorResponse(error, "Failed to adjust loyalty points");
  }
}
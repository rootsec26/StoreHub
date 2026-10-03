// Server-only loyalty pipeline used by the public checkout API.
// Kept apart from `@/lib/loyalty` (isomorphic, client-safe) so this module
// can freely import the database client.

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, loyaltySettings, loyaltyTransactions, vipTiers } from "@/db/schema";
import {
  clampRedeemedPoints,
  discountForPoints,
  normalizeLoyaltyPhone,
  pointsForSpend,
  roundMoney,
  tierForSpend,
  tierRecordFromRow,
  type CheckoutLoyaltyOutcome,
  type CheckoutLoyaltyResult,
  type VipTierRecord,
} from "@/lib/loyalty";

async function loadTiers(storeId: string): Promise<VipTierRecord[]> {
  const rows = await db
    .select()
    .from(vipTiers)
    .where(eq(vipTiers.storeId, storeId))
    .orderBy(asc(vipTiers.minSpendThreshold));
  return rows.map(tierRecordFromRow);
}

async function loadSettings(storeId: string) {
  const rows = await db
    .select()
    .from(loyaltySettings)
    .where(eq(loyaltySettings.storeId, storeId))
    .limit(1);
  return rows[0] ?? null;
}

function disabledResult(grossTotal: number): CheckoutLoyaltyResult {
  return {
    enabled: false,
    customerId: null,
    isNewMember: false,
    vipDiscount: 0,
    vipTier: null,
    pointsRedeemed: 0,
    redemptionDiscount: 0,
    finalTotal: roundMoney(grossTotal),
  };
}

export interface ComputeCheckoutLoyaltyParams {
  storeId: string;
  customerPhone: string;
  grossTotal: number;
  requestedPoints: number;
}

/**
 * Read-only loyalty pass run *before* the payment session is created:
 * resolves the member, applies the VIP tier discount and caps the requested
 * points redemption against the balance and the payable amount.
 */
export async function computeCheckoutLoyalty(
  params: ComputeCheckoutLoyaltyParams
): Promise<CheckoutLoyaltyResult> {
  const { storeId, customerPhone, grossTotal, requestedPoints } = params;
  try {
    const settings = await loadSettings(storeId);
    if (!settings || !settings.isEnabled) return disabledResult(grossTotal);

    const phone = normalizeLoyaltyPhone(customerPhone);
    const memberRows = phone
      ? await db
          .select()
          .from(customers)
          .where(
            and(eq(customers.storeId, storeId), eq(customers.phone, phone))
          )
          .limit(1)
      : [];
    const member = memberRows[0] ?? null;

    const tiers = await loadTiers(storeId);
    const lifetimeSpend = member ? Number(member.totalLifetimeSpend) || 0 : 0;
    const vipTier = tierForSpend(tiers, lifetimeSpend);
    const vipDiscount =
      vipTier && vipTier.discountPercentage > 0
        ? roundMoney((grossTotal * vipTier.discountPercentage) / 100)
        : 0;

    const budget = Math.max(0, roundMoney(grossTotal - vipDiscount));
    const pointsRedeemed = clampRedeemedPoints({
      requested: requestedPoints,
      balance: member?.loyaltyPoints ?? 0,
      redemptionRate: Number(settings.redemptionRate) || 0,
      maxDiscount: budget,
    });
    const redemptionDiscount = discountForPoints(
      pointsRedeemed,
      Number(settings.redemptionRate) || 0
    );

    return {
      enabled: true,
      customerId: member?.id ?? null,
      isNewMember: !member,
      vipDiscount,
      vipTier,
      pointsRedeemed,
      redemptionDiscount,
      finalTotal: Math.max(
        0,
        roundMoney(grossTotal - vipDiscount - redemptionDiscount)
      ),
    };
  } catch (error) {
    console.error("Compute checkout loyalty error:", error);
    return disabledResult(grossTotal);
  }
}

export interface FinalizeCheckoutLoyaltyParams {
  result: CheckoutLoyaltyResult;
  storeId: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Charged (post-discount) order total used for earning + lifetime spend. */
  orderTotal: number;
}

/**
 * Write pass run *after* the order row exists: creates the member on first
 * purchase, applies the welcome bonus, deducts redeemed points, awards earned
 * points, refreshes lifetime spend and re-evaluates the VIP tier.
 */
export async function finalizeCheckoutLoyalty(
  params: FinalizeCheckoutLoyaltyParams
): Promise<CheckoutLoyaltyOutcome | null> {
  const {
    result,
    storeId,
    orderId,
    customerName,
    customerPhone,
    customerEmail,
    orderTotal,
  } = params;
  if (!result.enabled) return null;

  try {
    const settings = await loadSettings(storeId);
    if (!settings || !settings.isEnabled) return null;

    const phone = normalizeLoyaltyPhone(customerPhone);
    if (!phone && !result.customerId) return null;

    let member: typeof customers.$inferSelect | null = null;
    if (result.customerId) {
      const rows = await db
        .select()
        .from(customers)
        .where(eq(customers.id, result.customerId))
        .limit(1);
      member = rows[0] ?? null;
    }

    let bonusPoints = 0;
    if (!member && phone) {
      const inserted = await db
        .insert(customers)
        .values({
          storeId,
          phone,
          name: customerName || "",
          email: customerEmail || "",
          loyaltyPoints: 0,
          totalLifetimeSpend: "0",
        })
        .onConflictDoNothing({
          target: [customers.storeId, customers.phone],
        })
        .returning();

      if (inserted[0]) {
        member = inserted[0];
        bonusPoints = Math.max(
          0,
          Math.floor(Number(settings.signupBonusPoints) || 0)
        );
      } else {
        // Lost a race with a concurrent checkout for the same phone.
        const rows = await db
          .select()
          .from(customers)
          .where(
            and(eq(customers.storeId, storeId), eq(customers.phone, phone))
          )
          .limit(1);
        member = rows[0] ?? null;
      }
    }

    if (!member) return null;

    const openingBalance = member.loyaltyPoints;
    const pointsEarned = pointsForSpend(
      orderTotal,
      Number(settings.pointsPerAmount) || 0
    );
    const lifetimeSpend = roundMoney(
      (Number(member.totalLifetimeSpend) || 0) + orderTotal
    );
    const tiers = await loadTiers(storeId);
    const tier = tierForSpend(tiers, lifetimeSpend);

    await db
      .update(customers)
      .set({
        loyaltyPoints: Math.max(
          0,
          openingBalance - result.pointsRedeemed + pointsEarned + bonusPoints
        ),
        totalLifetimeSpend: lifetimeSpend.toFixed(2),
        currentVipTierId: tier?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, member.id));

    // Append ledger entries with a running balance snapshot.
    let running = openingBalance;
    const entries: (typeof loyaltyTransactions.$inferInsert)[] = [];
    if (bonusPoints > 0) {
      running += bonusPoints;
      entries.push({
        storeId,
        customerId: member.id,
        points: bonusPoints,
        type: "signup_bonus",
        balanceAfter: running,
        orderId,
        description: "Welcome bonus",
      });
    }
    if (result.pointsRedeemed > 0) {
      running -= result.pointsRedeemed;
      entries.push({
        storeId,
        customerId: member.id,
        points: -result.pointsRedeemed,
        type: "redeem",
        balanceAfter: Math.max(0, running),
        orderId,
        description: `Redeemed on order ${orderId.slice(0, 8)}`,
      });
    }
    if (pointsEarned > 0) {
      running += pointsEarned;
      entries.push({
        storeId,
        customerId: member.id,
        points: pointsEarned,
        type: "earn",
        balanceAfter: running,
        orderId,
        description: `Earned on order ${orderId.slice(0, 8)}`,
      });
    }
    if (entries.length > 0) {
      await db.insert(loyaltyTransactions).values(entries);
    }

    return {
      pointsEarned,
      pointsRedeemed: result.pointsRedeemed,
      bonusPoints,
      discountAmount: roundMoney(
        result.vipDiscount + result.redemptionDiscount
      ),
      newBalance: Math.max(0, running),
      tierName: tier?.tierName ?? null,
    };
  } catch (error) {
    console.error("Finalize checkout loyalty error:", error);
    return null;
  }
}

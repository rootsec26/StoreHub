// Shared, isomorphic helpers for the Smart Customer Loyalty, Cashback &
// VIP Tiers Engine. This module is intentionally free of React and database
// imports so it can be used from server components, API routes, and client
// components (checkout widget, dashboard) alike.

import type { TranslationKey } from "@/lib/i18n";

export interface LoyaltySettingsRecord {
  id: string;
  storeId: string;
  pointsPerAmount: number;
  redemptionRate: number;
  signupBonusPoints: number;
  isEnabled: boolean;
}

export interface VipTierRecord {
  id: string;
  storeId: string;
  tierName: string;
  minSpendThreshold: number;
  discountPercentage: number;
  freeShippingUnlocked: boolean;
  badgeColor: string;
}

export interface LoyaltyLedgerRow {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  points: number;
  totalLifetimeSpend: number;
  earned: number;
  redeemed: number;
  tier: VipTierRecord | null;
}

export interface LoyaltyActivityRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  points: number;
  type: string;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface LoyaltySummary {
  members: number;
  outstandingPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  enabled: boolean;
}

/** Wire payload returned to the storefront checkout widget. */
export interface StorefrontLoyaltyPayload {
  enabled: boolean;
  settings: {
    pointsPerAmount: number;
    redemptionRate: number;
    signupBonusPoints: number;
  } | null;
  profile: {
    customerId: string;
    name: string;
    points: number;
    totalLifetimeSpend: number;
  } | null;
  tiers: VipTierRecord[];
}

export interface CheckoutLoyaltyResult {
  enabled: boolean;
  customerId: string | null;
  isNewMember: boolean;
  vipDiscount: number;
  vipTier: VipTierRecord | null;
  pointsRedeemed: number;
  redemptionDiscount: number;
  finalTotal: number;
}

/** What the storefront success banner renders after an order is placed. */
export interface CheckoutLoyaltyOutcome {
  pointsEarned: number;
  pointsRedeemed: number;
  bonusPoints: number;
  discountAmount: number;
  newBalance: number;
  tierName: string | null;
}

export const DEFAULT_LOYALTY_SETTINGS = {
  pointsPerAmount: 10,
  redemptionRate: 10,
  signupBonusPoints: 100,
  isEnabled: true,
} as const;

export const DEFAULT_VIP_TIERS: Array<
  Omit<VipTierRecord, "id" | "storeId">
> = [
  {
    tierName: "Bronze",
    minSpendThreshold: 0,
    discountPercentage: 0,
    freeShippingUnlocked: false,
    badgeColor: "#B45309",
  },
  {
    tierName: "Silver",
    minSpendThreshold: 5000,
    discountPercentage: 2,
    freeShippingUnlocked: false,
    badgeColor: "#94A3B8",
  },
  {
    tierName: "Gold",
    minSpendThreshold: 15000,
    discountPercentage: 5,
    freeShippingUnlocked: false,
    badgeColor: "#EAB308",
  },
  {
    tierName: "VIP",
    minSpendThreshold: 50000,
    discountPercentage: 10,
    freeShippingUnlocked: true,
    badgeColor: "#7C3AED",
  },
];

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Canonical customer key used by the loyalty engine: digits only, so
 * `+20 100 123 4567` and `01001234567` style entries resolve consistently.
 * Returns "" when the value is too short to be a real phone number.
 */
export function normalizeLoyaltyPhone(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

/** Drizzle returns `numeric` columns as strings - normalize to wire numbers. */export function settingsRecordFromRow(row: {
  id: string;
  storeId: string;
  pointsPerAmount: string | number;
  redemptionRate: string | number;
  signupBonusPoints: number;
  isEnabled: boolean;
}): LoyaltySettingsRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    pointsPerAmount: Number(row.pointsPerAmount) || 0,
    redemptionRate: Number(row.redemptionRate) || 0,
    signupBonusPoints: Number(row.signupBonusPoints) || 0,
    isEnabled: Boolean(row.isEnabled),
  };
}

export function tierRecordFromRow(row: {
  id: string;
  storeId: string;
  tierName: string;
  minSpendThreshold: string | number;
  discountPercentage: string | number;
  freeShippingUnlocked: boolean;
  badgeColor: string;
}): VipTierRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    tierName: row.tierName,
    minSpendThreshold: Number(row.minSpendThreshold) || 0,
    discountPercentage: Number(row.discountPercentage) || 0,
    freeShippingUnlocked: Boolean(row.freeShippingUnlocked),
    badgeColor: row.badgeColor,
  };
}

/** Whole points earned for an order: 10 EGP spent with rate 10 => 1 point. */
export function pointsForSpend(spend: number, pointsPerAmount: number): number {
  if (!(pointsPerAmount > 0) || !(spend > 0)) return 0;
  return Math.floor(spend / pointsPerAmount);
}

/** Cash value of redeemed points: 100 points at rate 10 => 10.00 EGP. */
export function discountForPoints(
  points: number,
  redemptionRate: number
): number {
  if (!(points > 0) || !(redemptionRate > 0)) return 0;
  return roundMoney(Math.floor((points / redemptionRate) * 100) / 100);
}

/** Points needed to cover a cash discount (rounded up to the next point). */
export function pointsForDiscount(
  discount: number,
  redemptionRate: number
): number {
  if (!(discount > 0) || !(redemptionRate > 0)) return 0;
  return Math.ceil(discount * redemptionRate);
}

/**
 * Largest point balance redeemable against `maxDiscount` worth of order:
 * capped by both the customer's balance and the payable amount.
 */
export function maxRedeemablePoints(
  balance: number,
  redemptionRate: number,
  maxDiscount: number
): number {
  if (!(balance > 0) || !(redemptionRate > 0) || !(maxDiscount > 0)) return 0;
  return Math.min(balance, Math.floor(maxDiscount * redemptionRate));
}

/** Clamps a shopper's requested redemption to a valid, fully-covered amount. */
export function clampRedeemedPoints(options: {
  requested: number;
  balance: number;
  redemptionRate: number;
  maxDiscount: number;
}): number {
  const { requested, balance, redemptionRate, maxDiscount } = options;
  const max = maxRedeemablePoints(balance, redemptionRate, maxDiscount);
  const wanted = Math.max(0, Math.floor(Number(requested) || 0));
  return Math.min(wanted, max);
}

/** Highest tier whose spend threshold is reached, or null when none match. */
export function tierForSpend(
  tiers: VipTierRecord[],
  spend: number
): VipTierRecord | null {
  const safeSpend = Number.isFinite(spend) ? spend : 0;
  let best: VipTierRecord | null = null;
  for (const tier of tiers) {
    if (safeSpend < tier.minSpendThreshold) continue;
    if (!best || tier.minSpendThreshold > best.minSpendThreshold) best = tier;
  }
  return best;
}

/** The next tier the customer could unlock (null when already at the top). */
export function nextTierForSpend(
  tiers: VipTierRecord[],
  spend: number
): VipTierRecord | null {
  const safeSpend = Number.isFinite(spend) ? spend : 0;
  let next: VipTierRecord | null = null;
  for (const tier of tiers) {
    if (tier.minSpendThreshold <= safeSpend) continue;
    if (!next || tier.minSpendThreshold < next.minSpendThreshold) next = tier;
  }
  return next;
}

export function loyaltyTransactionLabelKey(type: string): TranslationKey {
  switch (type) {
    case "earn":
      return "loyalty.txEarn";
    case "redeem":
      return "loyalty.txRedeem";
    case "signup_bonus":
      return "loyalty.txSignupBonus";
    case "adjustment":
      return "loyalty.txAdjustment";
    default:
      return "loyalty.txEarn";
  }
}

export const LOYALTY_TX_CLASS: Record<string, string> = {
  earn: "bg-emerald-100 text-emerald-700",
  signup_bonus: "bg-indigo-100 text-indigo-700",
  redeem: "bg-amber-100 text-amber-700",
  adjustment: "bg-slate-100 text-slate-700",
};

/**
 * Distributes a cash discount across payment line items proportionally so the
 * gateway session total matches the discounted order total. The residual cent
 * difference (from per-unit rounding) lands on the last line.
 */
export function applyDiscountToItems<
  T extends { unitPrice: number; quantity: number },
>(items: T[], discountAmount: number): T[] {
  if (!(discountAmount > 0) || items.length === 0) return items;
  const gross = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  if (!(gross > 0)) return items;
  const net = Math.max(0, roundMoney(gross - discountAmount));
  const factor = net / gross;
  const scaled = items.map((item) => ({
    ...item,
    unitPrice: roundMoney(item.unitPrice * factor),
  }));
  const scaledSum = scaled.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const residual = roundMoney(net - scaledSum);
  const last = scaled[scaled.length - 1];
  last.unitPrice = roundMoney(
    Math.max(0, last.unitPrice + residual / last.quantity)
  );
  return scaled;
}

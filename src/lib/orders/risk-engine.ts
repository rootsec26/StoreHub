import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { RISK_REASONS, type RiskLevel, type RiskReason } from "@/lib/orders/risk-shared";

export { RISK_REASONS };
export type { RiskLevel, RiskReason };

/**
 * Anti-Return Fraud Shield — order risk scoring.
 *
 * Runs the moment a (COD) order is created and persists `risk_score` +
 * `risk_reasons` next to the order so the merchant dashboard can flag fake /
 * high-return orders before the parcel is handed to the courier.
 */

/** Minimum believable shipping address length (e.g. "Cairo" is not enough). */
export const MIN_ADDRESS_LENGTH = 15;
/** 2+ cancelled/unverified orders on the same phone = repeat offender. */
export const UNVERIFIED_ORDER_FLAG_COUNT = 2;
/** High-value guard: order total above this (store threshold) is HIGH risk. */
export const DEFAULT_HIGH_VALUE_THRESHOLD = 1500;
/** Pending verifications older than this are treated as never confirmed. */
export const DEFAULT_VERIFICATION_TTL_HOURS = 24;


export interface RiskableOrder {
  customerPhone?: string | null;
  customerAddress?: string | null;
  totalAmount: string | number;
}

export interface CustomerRiskHistory {
  phone: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  unverifiedOrders: number;
}

export interface RiskAssessment {
  riskScore: RiskLevel;
  riskReasons: RiskReason[];
}

export const EMPTY_RISK_HISTORY: CustomerRiskHistory = {
  phone: "",
  totalOrders: 0,
  completedOrders: 0,
  cancelledOrders: 0,
  unverifiedOrders: 0,
};

/** Store-level high-value threshold in EGP (override with env var). */
export function getHighValueThreshold(): number {
  const raw = Number(process.env.COD_RISK_AMOUNT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HIGH_VALUE_THRESHOLD;
}

export function getVerificationTtlHours(): number {
  const raw = Number(process.env.COD_VERIFICATION_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VERIFICATION_TTL_HOURS;
}

/**
 * Formats a phone number the same way in JS and in SQL so `010…`,
 * `+20 10…` and `0020 10…` all collapse to one comparable key.
 */
export function normalizePhoneForMatch(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

const SQL_NORMALIZED_PHONE = sql`regexp_replace(regexp_replace(regexp_replace(coalesce(${orders.customerPhone}, ''), '\D', '', 'g'), '^00', ''), '^0', '20')`;

/**
 * Aggregates the buyer's order history for a phone number inside one store:
 * how many orders, how many were completed, cancelled or left unverified.
 */
export async function fetchCustomerRiskHistory(params: {
  storeId: string;
  phone?: string | null;
  excludeOrderId?: string;
}): Promise<CustomerRiskHistory> {
  const phoneKey = normalizePhoneForMatch(params.phone);
  if (!phoneKey) return { ...EMPTY_RISK_HISTORY, phone: "" };

  const conditions = [
    eq(orders.storeId, params.storeId),
    sql`${SQL_NORMALIZED_PHONE} = ${phoneKey}`,
  ];
  if (params.excludeOrderId) {
    conditions.push(ne(orders.id, params.excludeOrderId));
  }

  const rows = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      completedOrders: sql<number>`count(*) filter (where ${orders.status} = 'Completed')::int`,
      cancelledOrders: sql<number>`count(*) filter (where ${orders.status} = 'Cancelled')::int`,
      unverifiedOrders: sql<number>`count(*) filter (where ${orders.codVerificationStatus} = 'EXPIRED' and ${orders.status} <> 'Cancelled')::int`,
    })
    .from(orders)
    .where(and(...conditions));

  const row = rows[0];
  return {
    phone: phoneKey,
    totalOrders: Number(row?.totalOrders ?? 0),
    completedOrders: Number(row?.completedOrders ?? 0),
    cancelledOrders: Number(row?.cancelledOrders ?? 0),
    unverifiedOrders: Number(row?.unverifiedOrders ?? 0),
  };
}

/**
 * Core scoring rule set.
 *
 * HIGH  — incomplete address (< 15 chars, including a missing one),
 *         2+ cancelled/unverified orders on the same phone,
 *         or total above the store high-value threshold.
 * MEDIUM — a single previous cancellation, or a missing phone number.
 * LOW   — nothing flagged.
 */
export function evaluateOrderRisk(
  order: RiskableOrder,
  customerHistory: CustomerRiskHistory = EMPTY_RISK_HISTORY
): RiskAssessment {
  const reasons: RiskReason[] = [];
  const mediumReasons: RiskReason[] = [];

  const address = (order.customerAddress ?? "").trim();
  if (address.length < MIN_ADDRESS_LENGTH) {
    reasons.push(RISK_REASONS.incompleteAddress);
  }

  const badHistoryCount =
    customerHistory.cancelledOrders + customerHistory.unverifiedOrders;
  if (badHistoryCount >= UNVERIFIED_ORDER_FLAG_COUNT) {
    reasons.push(RISK_REASONS.multipleUnverifiedOrders);
  }

  const total = Number(order.totalAmount);
  if (Number.isFinite(total) && total > getHighValueThreshold()) {
    reasons.push(RISK_REASONS.highOrderValue);
  }

  if (customerHistory.cancelledOrders === 1) {
    mediumReasons.push(RISK_REASONS.previousCancellation);
  }
  if (!normalizePhoneForMatch(order.customerPhone)) {
    mediumReasons.push(RISK_REASONS.missingPhone);
  }

  if (reasons.length > 0) {
    return { riskScore: "HIGH", riskReasons: [...reasons, ...mediumReasons] };
  }
  if (mediumReasons.length > 0) {
    return { riskScore: "MEDIUM", riskReasons: mediumReasons };
  }
  return { riskScore: "LOW", riskReasons: [] };
}

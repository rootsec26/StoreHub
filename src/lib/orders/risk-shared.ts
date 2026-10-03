/**
 * Client-safe Anti-Return Fraud Shield constants (no server-only imports).
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** Canonical (English) reason strings persisted in `orders.risk_reasons`. */
export const RISK_REASONS = {
  incompleteAddress: "Incomplete Address",
  multipleUnverifiedOrders: "Multiple Unverified Orders",
  highOrderValue: "High Order Amount",
  missingPhone: "Missing Phone Number",
  previousCancellation: "Previous Cancellation",
} as const;

export type RiskReason = (typeof RISK_REASONS)[keyof typeof RISK_REASONS];

"use client";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { isCodOrder } from "@/lib/orders/cod-shared";
import { RISK_REASONS, type RiskLevel } from "@/lib/orders/risk-shared";

export interface CodOrderFields {
  status: string;
  paymentMethod?: string | null;
  codVerificationStatus?: string | null;
  riskScore?: string | null;
  riskReasons?: string[] | null;
}

const REASON_KEYS: Record<string, TranslationKey> = {
  [RISK_REASONS.incompleteAddress]: "orders.cod.reasonIncompleteAddress",
  [RISK_REASONS.multipleUnverifiedOrders]: "orders.cod.reasonMultipleUnverifiedOrders",
  [RISK_REASONS.highOrderValue]: "orders.cod.reasonHighOrderValue",
  [RISK_REASONS.missingPhone]: "orders.cod.reasonMissingPhone",
  [RISK_REASONS.previousCancellation]: "orders.cod.reasonPreviousCancellation",
};

export function riskReasonKey(reason: string): TranslationKey | null {
  return REASON_KEYS[reason] ?? null;
}

export function normalizeRiskLevel(score?: string | null): RiskLevel {
  return score === "HIGH" || score === "MEDIUM" ? score : "LOW";
}

export function CodRiskBadge({ score }: { score?: string | null }) {
  const { t } = useI18n();
  const level = normalizeRiskLevel(score);
  const config: Record<RiskLevel, { label: string; className: string; emoji: string }> = {
    LOW: { label: t("orders.cod.riskLow"), className: "bg-emerald-100 text-emerald-700", emoji: "🟢" },
    MEDIUM: { label: t("orders.cod.riskMedium"), className: "bg-amber-100 text-amber-700", emoji: "🟡" },
    HIGH: { label: t("orders.cod.riskHigh"), className: "bg-red-100 text-red-700", emoji: "🔴" },
  };
  const { label, className, emoji } = config[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
    </span>
  );
}

/**
 * 🟢 Verified COD / 🟡 Awaiting Verification / 🔴 High Fraud Risk
 * Returns nothing for non-COD orders.
 */
export default function CodVerificationBadge({ order }: { order: CodOrderFields }) {
  const { t } = useI18n();

  if (!isCodOrder(order)) return null;

  const status = order.codVerificationStatus ?? "NOT_REQUIRED";

  let config: { label: string; className: string; emoji: string } | null = null;
  if (status === "VERIFIED") {
    config = { label: t("orders.cod.verified"), className: "bg-emerald-100 text-emerald-700", emoji: "🟢" };
  } else if (order.riskScore === "HIGH") {
    config = { label: t("orders.cod.highRisk"), className: "bg-red-100 text-red-700", emoji: "🔴" };
  } else if (status === "PENDING_VERIFICATION") {
    config = { label: t("orders.cod.pending"), className: "bg-amber-100 text-amber-700", emoji: "🟡" };
  } else if (status === "EXPIRED") {
    config = { label: t("orders.cod.expired"), className: "bg-slate-100 text-slate-600", emoji: "⏳" };
  }

  if (!config) return null;

  const reasons = (order.riskReasons ?? []).join(", ");

  return (
    <span
      title={reasons || config.label}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}

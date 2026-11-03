"use client";

import { ORDER_STATUSES } from "@/lib/types";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { normalizeOrderStatus, orderStatusTitle } from "@/lib/order-state-machine";

const COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-purple-100 text-purple-700",
  READY: "bg-teal-100 text-teal-700",
  SHIPPED: "bg-cyan-100 text-cyan-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();

  // Legacy rows may hold "Pending"/"Completed"/… — normalize before looking
  // up colors and translation keys so badges never render blank/raw.
  const canonical = normalizeOrderStatus(status);
  const isKnown =
    canonical !== null &&
    (ORDER_STATUSES as readonly string[]).includes(canonical);
  const label = isKnown ? t(`status.${orderStatusTitle(canonical)}` as TranslationKey) : status;
  const colorKey = canonical ?? status;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        COLORS[colorKey] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}

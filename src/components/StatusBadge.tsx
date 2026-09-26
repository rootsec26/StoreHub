"use client";

import { ORDER_STATUSES } from "@/lib/types";
import { useI18n, type TranslationKey } from "@/lib/i18n";

const COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Confirmed: "bg-blue-100 text-blue-700",
  Preparing: "bg-purple-100 text-purple-700",
  Ready: "bg-teal-100 text-teal-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();

  const isKnown = (ORDER_STATUSES as readonly string[]).includes(status);
  const label = isKnown ? t(`status.${status}` as TranslationKey) : status;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        COLORS[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  );
}

"use client";

import { ChevronRight, MessageSquareCode } from "lucide-react";

import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { NotificationDTO } from "@/lib/messaging/types";

function audienceLabel(
  type: NotificationDTO["audienceType"],
  t: (key: TranslationKey) => string
): string {
  switch (type) {
    case "ALL_CUSTOMERS":
      return t("messages.audience.all");
    case "SELECTED_CUSTOMERS":
      return t("messages.audience.selected");
    case "CUSTOMER_SEGMENT":
      return t("messages.audience.segment");
    default:
      return type;
  }
}

export default function CampaignTable({
  campaigns,
  loading,
  onOpen,
}: {
  campaigns: NotificationDTO[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const { t, formatNumber, formatDate } = useI18n();

  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="ms-auto h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareCode}
        title={t("messages.empty.title")}
        description={t("messages.empty.subtitle")}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3 text-start">{t("messages.table.title")}</th>
            <th className="px-5 py-3 text-start">
              {t("messages.table.audience")}
            </th>
            <th className="px-5 py-3 text-start">{t("messages.table.status")}</th>
            <th className="px-5 py-3 text-end">
              {t("messages.table.recipients")}
            </th>
            <th className="px-5 py-3 text-end">
              {t("messages.table.delivered")}
            </th>
            <th className="px-5 py-3 text-end">{t("messages.table.failed")}</th>
            <th className="px-5 py-3 text-start">{t("messages.table.date")}</th>
            <th className="px-5 py-3" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {campaigns.map((campaign) => (
            <tr
              key={campaign.id}
              onClick={() => onOpen(campaign.id)}
              className="cursor-pointer transition-colors hover:bg-slate-50"
            >
              <td className="max-w-[280px] px-5 py-4">
                <p className="truncate text-sm font-medium text-slate-900">
                  {campaign.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                  {campaign.body}
                </p>
              </td>
              <td className="px-5 py-4 text-sm text-slate-600">
                {audienceLabel(campaign.audienceType, t)}
              </td>
              <td className="px-5 py-4">
                <Badge tone={statusTone(campaign.status)}>
                  {t(`messages.status.${campaign.status}` as TranslationKey)}
                </Badge>
              </td>
              <td className="px-5 py-4 text-end text-sm tabular-nums text-slate-600">
                {formatNumber(campaign.recipientCount)}
              </td>
              <td className="px-5 py-4 text-end text-sm tabular-nums text-emerald-600">
                {formatNumber(campaign.deliveredCount)}
              </td>
              <td className="px-5 py-4 text-end text-sm tabular-nums text-rose-600">
                {formatNumber(campaign.failedCount)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">
                {formatDate(campaign.createdAt)}
              </td>
              <td className="pe-5 py-4 text-end">
                <ChevronRight className="ms-auto h-4 w-4 text-slate-400 rtl:-scale-x-100" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

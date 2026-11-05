"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageSquareCode,
  Plus,
  Send,
  Users,
  XCircle,
} from "lucide-react";

import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Tabs from "@/components/ui/Tabs";
import Toast, { type ToastTone } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type {
  CampaignListResponse,
  CampaignSummaryStats,
  NotificationDTO,
} from "@/lib/messaging/types";

import CampaignComposer from "./CampaignComposer";
import CampaignDetail from "./CampaignDetail";
import CampaignTable from "./CampaignTable";
import InboxPanel from "./InboxPanel";

const EMPTY_SUMMARY: CampaignSummaryStats = {
  total: 0,
  draft: 0,
  active: 0,
  sent: 0,
  partial: 0,
  failed: 0,
  totalRecipients: 0,
  totalDelivered: 0,
  totalFailed: 0,
};

export default function NotificationsManager() {
  const { t, formatNumber } = useI18n();
  const searchParams = useSearchParams();

  const initialTab = searchParams.get("tab") === "inbox" ? "inbox" : "campaigns";
  const initialCampaign = searchParams.get("campaign");

  const [tab, setTab] = useState<"campaigns" | "inbox">(initialTab);
  const [campaigns, setCampaigns] = useState<NotificationDTO[]>([]);
  const [summary, setSummary] = useState<CampaignSummaryStats>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [composerOpen, setComposerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(initialCampaign);
  const [toast, setToast] = useState<{
    message: string;
    tone: ToastTone;
  } | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadCampaigns = useCallback(
    async (targetPage: number, status: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: "25",
        });
        if (status) params.set("status", status);
        const res = await fetch(`/api/notifications?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(t("common.retry"));
        const data = (await res.json()) as CampaignListResponse;
        setCampaigns(data.campaigns ?? []);
        setSummary(data.summary ?? EMPTY_SUMMARY);
        setTotal(data.total ?? 0);
        setPageSize(data.pageSize ?? 25);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("common.retry"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCampaigns(page, statusFilter);
  }, [page, statusFilter, loadCampaigns]);

  // Keep the tab badge fresh without stacking another polling loop: the inbox
  // panel reports its own unread count, and campaign counts come from the list.
  const campaignCount = summary.total;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const stats = useMemo(
    () => [
      {
        label: t("messages.stats.totalCampaigns"),
        value: summary.total,
        icon: MessageSquareCode,
        tone: "indigo" as const,
      },
      {
        label: t("messages.stats.totalRecipients"),
        value: summary.totalRecipients,
        icon: Users,
        tone: "slate" as const,
      },
      {
        label: t("messages.stats.delivered"),
        value: summary.totalDelivered,
        icon: Send,
        tone: "emerald" as const,
      },
      {
        label: t("messages.stats.failed"),
        value: summary.totalFailed,
        icon: XCircle,
        tone: "rose" as const,
      },
    ],
    [summary, t]
  );

  function handleCampaignChanged(updated: NotificationDTO) {
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === updated.id ? updated : campaign
      )
    );
    void loadCampaigns(page, statusFilter);
  }

  return (
    <div>
      <PageHeader
        title={t("messages.title")}
        subtitle={t("messages.subtitle")}
        actions={
          <Button onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("messages.new")}
          </Button>
        }
      />

      <div className="mb-5">
        <Tabs
          items={[
            {
              id: "campaigns",
              label: t("messages.tab.campaigns"),
              count: campaignCount,
            },
            {
              id: "inbox",
              label: t("messages.tab.inbox"),
              count: unreadCount,
            },
          ]}
          value={tab}
          onChange={(value) => setTab(value as "campaigns" | "inbox")}
          className="max-w-sm"
        />
      </div>

      {tab === "inbox" ? (
        <InboxPanel onUnreadChange={setUnreadCount} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={formatNumber(stat.value)}
                icon={stat.icon}
                tone={stat.tone}
              />
            ))}
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {t("messages.tab.campaigns")}
              </h2>
              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className="w-40"
                  aria-label={t("messages.table.status")}
                >
                  <option value="">{t("common.all")}</option>
                  {[
                    "DRAFT",
                    "SCHEDULED",
                    "QUEUED",
                    "SENDING",
                    "SENT",
                    "PARTIAL",
                    "FAILED",
                    "CANCELLED",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {t(`messages.status.${status}` as TranslationKey)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {error ? (
              <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                <AlertTriangle className="h-6 w-6 text-rose-500" />
                <p className="text-sm text-slate-600">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadCampaigns(page, statusFilter)}
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <CampaignTable
                campaigns={campaigns}
                loading={loading}
                onOpen={(id) => setDetailId(id)}
              />
            )}

            {!loading && !error && total > pageSize && (
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
                <p className="text-xs text-slate-500">
                  {formatNumber(page)} / {formatNumber(totalPages)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                    aria-label={t("common.back")}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={page >= totalPages}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                    aria-label={t("common.viewDetails")}
                  >
                    <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <CampaignComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(campaign) => {
          const failed = campaign.status === "FAILED";
          showToast(
            failed
              ? t("messages.toast.sendFailed")
              : campaign.status === "DRAFT"
                ? t("messages.toast.draft")
                : t("messages.toast.sent"),
            failed ? "error" : "success"
          );
          setPage(1);
          setStatusFilter("");
          void loadCampaigns(1, "");
        }}
      />

      <CampaignDetail
        campaignId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        onChanged={handleCampaignChanged}
      />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

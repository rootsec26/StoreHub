"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Send, XCircle } from "lucide-react";

import Badge, { statusTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type {
  NotificationDTO,
  RecipientDTO,
  SendBatchResult,
} from "@/lib/messaging/types";

interface CampaignDetailResponse {
  campaign: NotificationDTO;
  recipients: RecipientDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CampaignDetail({
  campaignId,
  open,
  onClose,
  onChanged,
}: {
  campaignId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: (campaign: NotificationDTO) => void;
}) {
  const { t, formatDate, formatDateTime, formatNumber } = useI18n();

  const [data, setData] = useState<CampaignDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<"send" | "retry" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );

  const load = useCallback(
    async (targetPage: number, status: string) => {
      if (!campaignId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: "25",
        });
        if (status) params.set("status", status);
        const res = await fetch(`/api/notifications/${campaignId}?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(t("common.retry"));
        const payload = (await res.json()) as CampaignDetailResponse;
        setData(payload);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : t("common.retry")
        );
      } finally {
        setLoading(false);
      }
    },
    [campaignId, t]
  );

  useEffect(() => {
    if (open && campaignId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPage(1);
      setStatusFilter("");
      setData(null);
      void load(1, "");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, campaignId, load]);

  const campaign = data?.campaign ?? null;
  const canSend =
    campaign !== null &&
    ["DRAFT", "SCHEDULED", "QUEUED", "PARTIAL", "FAILED"].includes(
      campaign.status
    );
  const canCancel =
    campaign !== null &&
    ["DRAFT", "SCHEDULED", "QUEUED"].includes(campaign.status);
  const canRetry =
    campaign !== null && ["PARTIAL", "FAILED"].includes(campaign.status);

  async function sendCampaign(retryFirst: boolean) {
    if (!campaignId || !campaign) return;
    setBusy(retryFirst ? "retry" : "send");
    setError(null);

    try {
      let send: SendBatchResult | null = null;
      let action = retryFirst ? "retry" : "send";

      let guard = 0;
      do {
        guard += 1;
        const res = await fetch(`/api/notifications/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { send?: SendBatchResult; campaign?: NotificationDTO; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(payload?.error ?? t("messages.toast.sendFailed"));
        }
        send = payload?.send ?? null;
        action = "send";
        if (send) {
          setProgress({
            done: send.total - send.remaining,
            total: send.total,
          });
        }
      } while (send && !send.done && guard < 500);

      if (send) {
        const updated: NotificationDTO = {
          ...campaign,
          status: send.status,
          deliveredCount: send.delivered,
          failedCount: send.failed,
          recipientCount: send.total,
        };
        onChanged(updated);
        setData((current) =>
          current ? { ...current, campaign: updated } : current
        );
      }
      void load(page, statusFilter);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("messages.toast.sendFailed")
      );
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function cancelCampaign() {
    if (!campaignId || !campaign) return;
    if (!window.confirm(t("messages.confirm.cancel"))) return;

    setBusy("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/notifications/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { campaign?: NotificationDTO; error?: string }
        | null;
      if (!res.ok || !payload?.campaign) {
        throw new Error(payload?.error ?? t("messages.toast.sendFailed"));
      }
      onChanged(payload.campaign);
      setData((current) =>
        current ? { ...current, campaign: payload.campaign! } : current
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("messages.toast.sendFailed")
      );
    } finally {
      setBusy(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("messages.detail.title")}
      description={campaign?.title}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            {t("common.close")}
          </Button>
          {canRetry && (
            <Button
              variant="outline"
              onClick={() => void sendCampaign(true)}
              loading={busy === "retry"}
              disabled={busy !== null}
            >
              {busy !== "retry" && <RefreshCw className="h-4 w-4" />}
              {t("messages.detail.retryFailed")}
            </Button>
          )}
          {canSend && (
            <Button
              onClick={() => void sendCampaign(false)}
              loading={busy === "send"}
              disabled={busy !== null}
            >
              {busy !== "send" && <Send className="h-4 w-4" />}
              {busy === "send" ? t("messages.sending") : t("messages.send")}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              onClick={() => void cancelCampaign()}
              loading={busy === "cancel"}
              disabled={busy !== null}
            >
              {busy !== "cancel" && <XCircle className="h-4 w-4" />}
              {t("messages.detail.cancel")}
            </Button>
          )}
        </>
      }
    >
      {progress && progress.total > 0 && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-xs font-medium text-indigo-700">
            {t("messages.progress", {
              done: progress.done,
              total: progress.total,
            })}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((progress.done / progress.total) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {loading && !campaign ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : campaign ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(campaign.status)}>
              {t(`messages.status.${campaign.status}` as TranslationKey)}
            </Badge>
            <Badge tone="slate">
              {t(`messages.category.${campaign.category}` as TranslationKey)}
            </Badge>
            <Badge tone="violet">
              {t(`messages.priority.${campaign.priority}` as TranslationKey)}
            </Badge>
            <span className="text-xs text-slate-500">
              {formatDateTime(campaign.createdAt)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t("messages.table.recipients"),
                value: campaign.recipientCount,
                tone: "text-slate-900",
              },
              {
                label: t("messages.table.delivered"),
                value: campaign.deliveredCount,
                tone: "text-emerald-600",
              },
              {
                label: t("messages.table.failed"),
                value: campaign.failedCount,
                tone: "text-rose-600",
              },
              {
                label: t("messages.stats.unreadInbox"),
                value: campaign.readCount,
                tone: "text-indigo-600",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className={`mt-0.5 text-lg font-bold ${stat.tone}`}>
                  {formatNumber(stat.value)}
                </p>
              </div>
            ))}
          </div>

          <section>
            <h4 className="mb-1.5 text-sm font-semibold text-slate-900">
              {t("messages.detail.content")}
            </h4>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
              {campaign.body}
            </div>
            {campaign.sentAt && (
              <p className="mt-1.5 text-xs text-slate-500">
                {t("messages.table.date")}: {formatDate(campaign.sentAt)}
              </p>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                {t("messages.detail.recipients")}
              </h4>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const next = event.target.value;
                  setStatusFilter(next);
                  setPage(1);
                  void load(1, next);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
              >
                <option value="">{t("common.all")}</option>
                {["PENDING", "SENT", "DELIVERED", "FAILED", "SKIPPED", "READ"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {t(
                        `messages.recipientStatus.${status}` as TranslationKey
                      )}
                    </option>
                  )
                )}
              </select>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : !data || data.recipients.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                {t("messages.detail.noRecipients")}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-start">
                        {t("table.customer")}
                      </th>
                      <th className="px-3 py-2 text-start">{t("table.phone")}</th>
                      <th className="px-3 py-2 text-start">
                        {t("messages.table.status")}
                      </th>
                      <th className="px-3 py-2 text-start">
                        {t("table.date")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recipients.map((recipient) => (
                      <tr key={recipient.id}>
                        <td className="max-w-[180px] truncate px-3 py-2 text-sm text-slate-800">
                          {recipient.name || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-600">
                          {recipient.phone || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={statusTone(recipient.status)}>
                            {t(
                              `messages.recipientStatus.${recipient.status}` as TranslationKey
                            )}
                          </Badge>
                          {recipient.errorMessage && (
                            <p className="mt-0.5 text-[11px] text-rose-600">
                              {recipient.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                          {maybeDate(recipient, formatDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data && data.total > data.pageSize && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {formatNumber(data.total)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, page - 1);
                      setPage(next);
                      void load(next, statusFilter);
                    }}
                    disabled={page <= 1 || loading}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                    aria-label={t("common.back")}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                  <span className="px-2 text-xs text-slate-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(totalPages, page + 1);
                      setPage(next);
                      void load(next, statusFilter);
                    }}
                    disabled={page >= totalPages || loading}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                    aria-label={t("common.viewDetails")}
                  >
                    <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

/** Recipients show the delivery timestamp when present, else creation time. */
function maybeDate(
  recipient: RecipientDTO,
  formatDate: (value: string | number | Date) => string
): string {
  const value =
    recipient.deliveredAt ?? recipient.sentAt ?? recipient.createdAt;
  return value ? formatDate(value) : "—";
}

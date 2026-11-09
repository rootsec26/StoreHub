"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search, Send, Save } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { cn } from "@/components/ui/cn";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  SEND_BATCH_SIZE,
} from "@/lib/messaging/constants";
import type {
  AudiencePreview,
  NotificationDTO,
  SendBatchResult,
} from "@/lib/messaging/types";

type AudienceType =
  | "ALL_CUSTOMERS"
  | "SELECTED_CUSTOMERS"
  | "CUSTOMER_SEGMENT";

interface SelectableCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalSpent: number;
}

function maskPhone(phone: string): string {
  return phone ? `••••${phone.slice(-4)}` : "";
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function CampaignComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: NotificationDTO) => void;
}) {
  const { t, formatNumber } = useI18n();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [priority, setPriority] = useState("NORMAL");
  const [audienceType, setAudienceType] =
    useState<AudienceType>("ALL_CUSTOMERS");
  const [minSpend, setMinSpend] = useState("");
  const [lastOrderDays, setLastOrderDays] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  const [customers, setCustomers] = useState<SelectableCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customersLoading, setCustomersLoading] = useState(false);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState<"draft" | "send" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTitle("");
    setBody("");
    setCategory("GENERAL");
    setPriority("NORMAL");
    setAudienceType("ALL_CUSTOMERS");
    setMinSpend("");
    setLastOrderDays("");
    setSelectedCustomerIds([]);
    setCustomerSearch("");
    setPreview(null);
    setError(null);
    setProgress(null);
    setSubmitting(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset();
  }, [open, reset]);

  const audienceFilter = useMemo(() => {
    if (audienceType === "SELECTED_CUSTOMERS") {
      return { customerIds: selectedCustomerIds };
    }
    if (audienceType === "CUSTOMER_SEGMENT") {
      return {
        minSpend: numberOrUndefined(minSpend),
        lastOrderDays: numberOrUndefined(lastOrderDays),
      };
    }
    return {};
  }, [
    audienceType,
    selectedCustomerIds,
    minSpend,
    lastOrderDays,
  ]);

  // Audience preview with a light debounce so typing a segment threshold
  // doesn't fire a request per keystroke.
  useEffect(() => {
    if (!open) return;

    if (
      audienceType === "SELECTED_CUSTOMERS" &&
      selectedCustomerIds.length === 0
    ) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPreview(null);
      setPreviewLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    if (audienceType === "CUSTOMER_SEGMENT") {
      const hasFilter =
        numberOrUndefined(minSpend) !== undefined ||
        numberOrUndefined(lastOrderDays) !== undefined;
      if (!hasFilter) {
        setPreview(null);
        setPreviewLoading(false);
        return;
      }
    }

    let cancelled = false;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ audienceType });
        if (audienceType === "SELECTED_CUSTOMERS") {
          params.set("customerIds", selectedCustomerIds.join(","));
        }
        if (audienceType === "CUSTOMER_SEGMENT") {
          if (numberOrUndefined(minSpend) !== undefined) {
            params.set("minSpend", String(numberOrUndefined(minSpend)));
          }
          if (numberOrUndefined(lastOrderDays) !== undefined) {
            params.set("lastOrderDays", String(numberOrUndefined(lastOrderDays)));
          }
        }

        const res = await fetch(`/api/notifications/audience?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("preview");
        const data = (await res.json()) as AudiencePreview;
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    open,
    audienceType,
    selectedCustomerIds,
    minSpend,
    lastOrderDays,
  ]);

  // Customer picker data, refreshed as the search term changes.
  useEffect(() => {
    if (!open || audienceType !== "SELECTED_CUSTOMERS") return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomersLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (customerSearch.trim()) params.set("q", customerSearch.trim());
        const res = await fetch(
          `/api/notifications/audience/customers?${params}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("customers");
        const data = (await res.json()) as { customers?: SelectableCustomer[] };
        if (!cancelled) setCustomers(data.customers ?? []);
      } catch {
        if (!cancelled) setCustomers([]);
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, audienceType, customerSearch]);

  function toggleCustomer(id: string) {
    setSelectedCustomerIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  function validate(): string | null {
    if (!title.trim()) return "Title is required";
    if (!body.trim()) return "Message is required";
    if (body.length > MAX_BODY_LENGTH) {
      return `Message is limited to ${MAX_BODY_LENGTH} characters`;
    }
    if (audienceType === "SELECTED_CUSTOMERS" && selectedCustomerIds.length === 0) {
      return t("messages.audience.empty");
    }
    if (audienceType === "CUSTOMER_SEGMENT") {
      const hasFilter =
        numberOrUndefined(minSpend) !== undefined ||
        numberOrUndefined(lastOrderDays) !== undefined;
      if (!hasFilter) return t("messages.audience.empty");
    }
    if (!preview || preview.count === 0) return t("messages.audience.empty");
    return null;
  }

  async function createAndMaybeSend(sendNow: boolean) {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(sendNow ? "send" : "draft");

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          audienceType,
          audienceFilter,
          sendNow,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | {
            campaign?: NotificationDTO;
            send?: SendBatchResult | null;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.campaign) {
        throw new Error(data?.error ?? t("messages.toast.sendFailed"));
      }

      let campaign = data.campaign;

      if (sendNow) {
        let send = data.send ?? null;
        const total = campaign.recipientCount;
        setProgress({
          done: send ? total - send.remaining : 0,
          total,
        });

        let guard = 0;
        while (send && !send.done && guard < 500) {
          guard += 1;
          const nextRes = await fetch(`/api/notifications/${campaign.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send" }),
          });
          const nextData = (await nextRes.json().catch(() => null)) as
            | { send?: SendBatchResult; error?: string }
            | null;
          if (!nextRes.ok || !nextData?.send) {
            throw new Error(nextData?.error ?? t("messages.toast.sendFailed"));
          }
          send = nextData.send;
          setProgress({ done: total - send.remaining, total });
        }

        if (send) {
          campaign = {
            ...campaign,
            status: send.status,
            deliveredCount: send.delivered,
            failedCount: send.failed,
            recipientCount: send.total,
          };
        }
      }

      onCreated(campaign);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("messages.toast.sendFailed")
      );
    } finally {
      setSubmitting(null);
      setProgress(null);
    }
  }

  const overLimit = body.length > MAX_BODY_LENGTH;
  const insufficient =
    preview !== null && preview.whatsappCredits !== null
      ? !preview.hasSufficientCredits
      : false;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title={t("messages.compose.title")}
      description={t("messages.subtitle")}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={submitting !== null}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void createAndMaybeSend(false)}
            loading={submitting === "draft"}
            disabled={submitting !== null}
          >
            {submitting !== "draft" && <Save className="h-4 w-4" />}
            {t("messages.saveDraft")}
          </Button>
          <Button
            onClick={() => void createAndMaybeSend(true)}
            loading={submitting === "send"}
            disabled={submitting !== null || insufficient}
          >
            {submitting !== "send" && <Send className="h-4 w-4" />}
            {submitting === "send"
              ? t("messages.sending")
              : t("messages.send")}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* Message content */}
        <div className="space-y-4">
          <Input
            label={t("messages.field.title")}
            placeholder={t("messages.field.titlePlaceholder")}
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting !== null}
          />

          <div>
            <Textarea
              label={t("messages.field.body")}
              placeholder={t("messages.field.bodyPlaceholder")}
              value={body}
              maxLength={MAX_BODY_LENGTH + 200}
              onChange={(event) => setBody(event.target.value)}
              disabled={submitting !== null}
              className={cn(overLimit && "border-rose-300")}
            />
            <p
              className={cn(
                "mt-1 text-end text-xs",
                overLimit ? "text-rose-600" : "text-slate-400"
              )}
            >
              {formatNumber(body.length)} / {formatNumber(MAX_BODY_LENGTH)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("messages.field.category")}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={submitting !== null}
            >
              {["GENERAL", "ANNOUNCEMENT", "PROMOTION", "ORDER_UPDATE", "SYSTEM"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`messages.category.${value}` as TranslationKey)}
                  </option>
                )
              )}
            </Select>

            <Select
              label={t("messages.field.priority")}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              disabled={submitting !== null}
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                <option key={value} value={value}>
                  {t(`messages.priority.${value}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Audience */}
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              {t("messages.step.audience")}
            </p>
            <div className="space-y-2">
              {(
                [
                  { id: "ALL_CUSTOMERS", label: t("messages.audience.all") },
                  {
                    id: "SELECTED_CUSTOMERS",
                    label: t("messages.audience.selected"),
                  },
                  {
                    id: "CUSTOMER_SEGMENT",
                    label: t("messages.audience.segment"),
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    audienceType === option.id
                      ? "border-indigo-300 bg-indigo-50/60 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <input
                    type="radio"
                    name="audienceType"
                    className="h-4 w-4 text-indigo-600"
                    checked={audienceType === option.id}
                    onChange={() => setAudienceType(option.id)}
                    disabled={submitting !== null}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {audienceType === "SELECTED_CUSTOMERS" && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t("common.search")}
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  disabled={submitting !== null}
                  className="ps-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                {customersLoading ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">
                    {t("common.loading")}
                  </p>
                ) : customers.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">
                    {t("messages.audience.noCustomers")}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {customers.map((customer) => (
                      <li key={customer.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded text-indigo-600"
                            checked={selectedCustomerIds.includes(customer.id)}
                            onChange={() => toggleCustomer(customer.id)}
                            disabled={submitting !== null}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-800">
                              {customer.name || maskPhone(customer.phone)}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {maskPhone(customer.phone)}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t("messages.audience.selectedCount", {
                  count: selectedCustomerIds.length,
                })}
              </p>
            </div>
          )}

          {audienceType === "CUSTOMER_SEGMENT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t("messages.audience.minSpend")}
                type="number"
                min={0}
                value={minSpend}
                onChange={(event) => setMinSpend(event.target.value)}
                disabled={submitting !== null}
              />
              <Input
                label={t("messages.audience.lastOrderDays")}
                type="number"
                min={1}
                value={lastOrderDays}
                onChange={(event) => setLastOrderDays(event.target.value)}
                disabled={submitting !== null}
              />
            </div>
          )}

          {/* Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                {t("messages.audience.preview")}
              </p>
              {previewLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              )}
            </div>

            {!preview ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("messages.audience.empty")}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge tone={preview.count > 0 ? "indigo" : "slate"}>
                    {t("messages.audience.recipients", {
                      count: preview.count,
                    })}
                  </Badge>
                  <Badge tone="emerald">
                    {t("messages.audience.estimatedCredits", {
                      count: preview.estimatedCredits,
                    })}
                  </Badge>
                </div>

                <p className="text-xs text-slate-500">
                  {preview.whatsappCredits === null
                    ? t("messages.audience.balanceUnknown")
                    : t("messages.audience.balance", {
                        count: preview.whatsappCredits,
                      })}
                </p>

                {insufficient && (
                  <p className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("messages.audience.insufficient")}
                  </p>
                )}

                {preview.sample.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {t("messages.audience.sample")}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {preview.sample.map((row, index) => (
                        <li
                          key={`${row.phone}-${index}`}
                          className="text-xs text-slate-600"
                        >
                          {row.name} · {row.phone}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {progress && progress.total > 0 && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
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
        <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        {SEND_BATCH_SIZE} recipients per batch · 1 WhatsApp credit per message
      </p>
    </Modal>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from "@/lib/messaging/constants";
import type {
  AdminCampaignDTO,
  AdminUsersResponse,
  RecipientDTO,
} from "@/lib/messaging/types";

type AudienceType = "ALL_MERCHANTS" | "MERCHANT_PLAN" | "SELECTED_MERCHANTS";

interface BroadcastListResponse {
  campaigns: AdminCampaignDTO[];
  total: number;
  page: number;
  pageSize: number;
}

function audienceLabel(type: string, plan?: string): string {
  if (type === "ALL_MERCHANTS") return "All merchants";
  if (type === "MERCHANT_PLAN") return `Plan: ${plan === "pro" ? "Pro" : "Free"}`;
  return "Selected merchants";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BroadcastsManager() {
  const [campaigns, setCampaigns] = useState<AdminCampaignDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/broadcasts?page=${targetPage}&limit=25`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load broadcasts");
      const data = (await res.json()) as BroadcastListResponse;
      setCampaigns(data.campaigns ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load broadcasts"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page);
  }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Broadcasts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            In-app announcements delivered to merchant inboxes. Sending is
            immediate.
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4" />
          New broadcast
        </Button>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ms-auto h-4 w-20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => void load(page)}
              className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No broadcasts yet"
            description="Create your first announcement to reach store owners in-app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Announcement",
                    "Audience",
                    "Recipients",
                    "Read",
                    "Sent",
                    "Status",
                  ].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    onClick={() => setDetailId(campaign.id)}
                    className="cursor-pointer hover:bg-slate-50/70"
                  >
                    <td className="max-w-[300px] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">
                        {campaign.title}
                      </p>
                      <p className="line-clamp-1 text-sm text-slate-500">
                        {campaign.body}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {audienceLabel(
                        campaign.audienceType,
                        campaign.audienceFilter?.plan
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-600">
                      {campaign.recipientCount.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-indigo-600">
                      {campaign.readCount.toLocaleString("en-US")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(campaign.sentAt ?? campaign.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="emerald">Sent</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {total.toLocaleString("en-US")} broadcasts
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <BroadcastComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(campaign) => {
          setComposerOpen(false);
          setToast({
            message: `Broadcast sent to ${campaign.recipientCount.toLocaleString(
              "en-US"
            )} merchants`,
            tone: "success",
          });
          setPage(1);
          void load(1);
        }}
      />

      <BroadcastDetail
        broadcastId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />

      {toast && (
        <div
          className={cn(
            "fixed bottom-4 end-4 z-[90] flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg",
            toast.tone === "success" ? "bg-emerald-600" : "bg-rose-600"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function BroadcastComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: AdminCampaignDTO) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("ANNOUNCEMENT");
  const [priority, setPriority] = useState("NORMAL");
  const [audienceType, setAudienceType] =
    useState<AudienceType>("ALL_MERCHANTS");
  const [plan, setPlan] = useState<"free" | "pro">("pro");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedMerchantIds, setSelectedMerchantIds] = useState<string[]>([]);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchants, setMerchants] = useState<AdminUsersResponse["users"]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset the draft every time the composer is opened.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle("");
    setBody("");
    setCategory("ANNOUNCEMENT");
    setPriority("NORMAL");
    setAudienceType("ALL_MERCHANTS");
    setPlan("pro");
    setExpiresAt("");
    setSelectedMerchantIds([]);
    setMerchantSearch("");
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  useEffect(() => {
    if (!open || audienceType !== "SELECTED_MERCHANTS") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMerchantsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ tab: "all", limit: "100" });
        if (merchantSearch.trim()) params.set("q", merchantSearch.trim());
        const res = await fetch(`/api/admin/users?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("merchants");
        const data = (await res.json()) as AdminUsersResponse;
        if (!cancelled) {
          setMerchants((data.users ?? []).filter((user) => user.store !== null));
        }
      } catch {
        if (!cancelled) setMerchants([]);
      } finally {
        if (!cancelled) setMerchantsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, audienceType, merchantSearch]);

  const audienceFilter = useMemo(() => {
    if (audienceType === "MERCHANT_PLAN") return { plan };
    if (audienceType === "SELECTED_MERCHANTS") {
      return { merchantIds: selectedMerchantIds };
    }
    return {};
  }, [audienceType, plan, selectedMerchantIds]);

  async function submit() {
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required");
      return;
    }
    if (body.length > MAX_BODY_LENGTH) {
      setError(`Message is limited to ${MAX_BODY_LENGTH} characters`);
      return;
    }
    if (
      audienceType === "SELECTED_MERCHANTS" &&
      selectedMerchantIds.length === 0
    ) {
      setError("Select at least one merchant");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          priority,
          audienceType,
          audienceFilter,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { campaign?: AdminCampaignDTO; error?: string }
        | null;
      if (!res.ok || !payload?.campaign) {
        throw new Error(payload?.error ?? "Failed to send broadcast");
      }
      onCreated(payload.campaign);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to send broadcast"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New broadcast"
      description="Delivered immediately to merchant in-app inboxes. English only."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            {!submitting && <Megaphone className="h-4 w-4" />}
            Send broadcast
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
          />
          <div>
            <Textarea
              label="Message"
              value={body}
              maxLength={MAX_BODY_LENGTH + 200}
              onChange={(event) => setBody(event.target.value)}
              disabled={submitting}
              className={cn(body.length > MAX_BODY_LENGTH && "border-rose-300")}
            />
            <p
              className={cn(
                "mt-1 text-end text-xs",
                body.length > MAX_BODY_LENGTH
                  ? "text-rose-600"
                  : "text-slate-400"
              )}
            >
              {body.length.toLocaleString("en-US")} /{" "}
              {MAX_BODY_LENGTH.toLocaleString("en-US")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={submitting}
            >
              {["ANNOUNCEMENT", "GENERAL", "PROMOTION", "SYSTEM"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                )
              )}
            </Select>
            <Select
              label="Priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              disabled={submitting}
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Expires at (optional)"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              Audience
            </p>
            <div className="space-y-2">
              {(
                [
                  { id: "ALL_MERCHANTS", label: "All merchants" },
                  { id: "MERCHANT_PLAN", label: "By plan" },
                  { id: "SELECTED_MERCHANTS", label: "Selected merchants" },
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
                    name="broadcastAudience"
                    className="h-4 w-4 text-indigo-600"
                    checked={audienceType === option.id}
                    onChange={() => setAudienceType(option.id)}
                    disabled={submitting}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {audienceType === "MERCHANT_PLAN" && (
            <Select
              label="Plan"
              value={plan}
              onChange={(event) =>
                setPlan(event.target.value === "free" ? "free" : "pro")
              }
              disabled={submitting}
            >
              <option value="pro">Pro</option>
              <option value="free">Free</option>
            </Select>
          )}

          {audienceType === "SELECTED_MERCHANTS" && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search store or owner"
                  value={merchantSearch}
                  onChange={(event) => setMerchantSearch(event.target.value)}
                  disabled={submitting}
                  className="ps-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {merchantsLoading ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">
                    Loading...
                  </p>
                ) : merchants.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">
                    No merchants found.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {merchants.map((merchant) => (
                      <li key={merchant.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded text-indigo-600"
                            checked={selectedMerchantIds.includes(merchant.id)}
                            onChange={() =>
                              setSelectedMerchantIds((current) =>
                                current.includes(merchant.id)
                                  ? current.filter((id) => id !== merchant.id)
                                  : [...current, merchant.id]
                              )
                            }
                            disabled={submitting}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-800">
                              {merchant.store?.name ?? merchant.name}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {merchant.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {selectedMerchantIds.length} selected
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Modal>
  );
}

function BroadcastDetail({
  broadcastId,
  open,
  onClose,
}: {
  broadcastId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [campaign, setCampaign] = useState<AdminCampaignDTO | null>(null);
  const [recipients, setRecipients] = useState<RecipientDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !broadcastId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/admin/broadcasts/${broadcastId}?limit=100`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data:
            | {
                campaign?: AdminCampaignDTO;
                recipients?: RecipientDTO[];
              }
            | null
        ) => {
          if (cancelled || !data) return;
          setCampaign(data.campaign ?? null);
          setRecipients(data.recipients ?? []);
        }
      )
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, broadcastId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Broadcast details"
      description={campaign?.title}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : campaign ? (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Recipients", value: campaign.recipientCount },
              { label: "Read", value: campaign.readCount },
              { label: "Unread", value: campaign.recipientCount - campaign.readCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">
                  {stat.value.toLocaleString("en-US")}
                </p>
              </div>
            ))}
          </div>

          <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
            {campaign.body}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <BellRing className="h-4 w-4 text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-900">
                Delivery log
              </h4>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px]">
                <thead className="bg-slate-50">
                  <tr>
                    {["Merchant", "Email", "Status", "Read at"].map((header) => (
                      <th
                        key={header}
                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.map((recipient) => (
                    <tr key={recipient.id}>
                      <td className="max-w-[200px] truncate px-3 py-2 text-sm text-slate-800">
                        {recipient.name || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-600">
                        {recipient.email || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={recipient.readAt ? "emerald" : "slate"}>
                          {recipient.readAt ? "Read" : "Sent"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                        {formatDate(recipient.readAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Broadcast not found.</p>
      )}
    </Modal>
  );
}

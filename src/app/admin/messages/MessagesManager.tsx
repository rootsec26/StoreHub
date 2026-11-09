"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquareCode,
  Search,
} from "lucide-react";

import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import type {
  AdminCampaignDTO,
  AdminUsersResponse,
  RecipientDTO,
} from "@/lib/messaging/types";
import RecipientsManager from "./RecipientsManager";

interface MessageListResponse {
  campaigns: AdminCampaignDTO[];
  total: number;
  page: number;
  pageSize: number;
}

interface StoreOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  PARTIAL: "Partial",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  DELIVERED: "Delivered",
  SKIPPED: "Skipped",
  READ: "Read",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
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

function CampaignsManager() {
  const [campaigns, setCampaigns] = useState<AdminCampaignDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Store filter options come from the admin users endpoint (one row per
  // owner, filtered to those that actually own a store).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users?tab=all&limit=100", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AdminUsersResponse | null) => {
        if (cancelled || !data) return;
        const seen = new Set<string>();
        const options: StoreOption[] = [];
        for (const user of data.users) {
          if (user.store && !seen.has(user.store.id)) {
            seen.add(user.store.id);
            options.push({ id: user.store.id, name: user.store.name });
          }
        }
        setStores(options);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (storeId) params.set("storeId", storeId);

      const res = await fetch(`/api/admin/messages?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load messages");
      const data = (await res.json()) as MessageListResponse;
      setCampaigns(data.campaigns ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load messages"
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Merchant messages
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Read-only log of merchant → customer WhatsApp campaigns. Recipient
          phone numbers are masked.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search campaign title"
            className="w-64 ps-9"
          />
        </div>
        <Select
          value={storeId}
          onChange={(event) => {
            setStoreId(event.target.value);
            setPage(1);
          }}
          className="w-52"
          aria-label="Filter by store"
        >
          <option value="">All stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
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
              onClick={() => void load()}
              className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={MessageSquareCode}
            title="No campaigns yet"
            description="Merchant WhatsApp campaigns will appear here once they are created."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Campaign",
                    "Store",
                    "Status",
                    "Recipients",
                    "Delivered",
                    "Failed",
                    "Created",
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
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">
                        {campaign.title}
                      </p>
                      <p className="line-clamp-1 text-sm text-slate-500">
                        {campaign.body}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {campaign.storeName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(campaign.status)}>
                        {statusLabel(campaign.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-600">
                      {campaign.recipientCount.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-emerald-600">
                      {campaign.deliveredCount.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-rose-600">
                      {campaign.failedCount.toLocaleString("en-US")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(campaign.createdAt)}
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
              {total.toLocaleString("en-US")} campaigns
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

      <MessageDetail
        messageId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function MessageDetail({
  messageId,
  open,
  onClose,
}: {
  messageId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [campaign, setCampaign] = useState<AdminCampaignDTO | null>(null);
  const [recipients, setRecipients] = useState<RecipientDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !messageId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/admin/messages/${messageId}?limit=100`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data:
            | { campaign?: AdminCampaignDTO; recipients?: RecipientDTO[] }
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
  }, [open, messageId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Campaign log"
      description={campaign?.title}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(campaign.status)}>
              {statusLabel(campaign.status)}
            </Badge>
            {campaign.storeSlug && (
              <Link
                href={`/store/${campaign.storeSlug}`}
                target="_blank"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                /store/{campaign.storeSlug}
              </Link>
            )}
            <span className="text-xs text-slate-500">
              {formatDate(campaign.createdAt)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Recipients", value: campaign.recipientCount },
              { label: "Delivered", value: campaign.deliveredCount },
              { label: "Failed", value: campaign.failedCount },
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

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50">
                <tr>
                  {["Recipient", "Phone (masked)", "Status", "Date"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="max-w-[180px] truncate px-3 py-2 text-sm text-slate-800">
                      {recipient.name || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-slate-600">
                      {recipient.phone || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(recipient.status)}>
                        {statusLabel(recipient.status)}
                      </Badge>
                      {recipient.errorMessage && (
                        <p className="mt-0.5 text-[11px] text-rose-600">
                          {recipient.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDate(
                        recipient.deliveredAt ??
                          recipient.sentAt ??
                          recipient.createdAt
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Campaign not found.</p>
      )}
    </Modal>
  );
}

export default function MessagesManager() {
  const [view, setView] = useState<"campaigns" | "recipients">("campaigns");

  return (
    <div className="space-y-6">
      <Tabs
        items={[
          { id: "campaigns", label: "Campaigns" },
          { id: "recipients", label: "Message log" },
        ]}
        value={view}
        onChange={(value) => setView(value as "campaigns" | "recipients")}
      />
      {view === "campaigns" ? <CampaignsManager /> : <RecipientsManager />}
    </div>
  );
}


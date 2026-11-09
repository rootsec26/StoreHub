"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
} from "lucide-react";

import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import type { AdminUsersResponse } from "@/lib/messaging/types";

interface RecipientRow {
  id: string;
  notificationId: string;
  campaignTitle: string;
  scope: string;
  status: string;
  recipientType: "CUSTOMER" | "MERCHANT";
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  channel: string;
  storeId: string | null;
  storeName: string | null;
  storeSlug: string | null;
  senderName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface RecipientsResponse {
  recipients: RecipientRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface StoreOption {
  id: string;
  name: string;
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

export default function RecipientsManager() {
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

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
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (storeId) params.set("storeId", storeId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/messages/recipients?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load message log");
      const data = (await res.json()) as RecipientsResponse;
      setRecipients(data.recipients ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load message log");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, storeId, status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search recipient or campaign"
            className="w-64 ps-9"
          />
        </div>
        <Select
          value={storeId}
          onChange={(event) => {
            setStoreId(event.target.value);
            setPage(1);
          }}
          className="w-48"
          aria-label="Filter by store"
        >
          <option value="">All stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="w-36"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option>
          <option value="READ">Read</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
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
        ) : recipients.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No message deliveries"
            description="Individual recipient rows will appear after campaigns or broadcasts are sent."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50">
                <tr>
                  {["Message", "Store", "Recipient", "Contact", "Status", "Sent", "Delivered", "Read"].map((header) => (
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
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{recipient.campaignTitle}</p>
                      <p className="text-xs text-slate-500">
                        {recipient.scope === "ADMIN" ? "Admin broadcast" : "Merchant campaign"} · {recipient.channel}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{recipient.storeName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{recipient.recipientName || "—"}</p>
                      <p className="text-xs text-slate-500">{recipient.recipientType}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <p className="font-mono text-xs">{recipient.recipientPhone || "—"}</p>
                      <p className="text-xs text-slate-400">{recipient.recipientEmail || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(recipient.status)}>{recipient.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDate(recipient.sentAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDate(recipient.deliveredAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDate(recipient.readAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">{total.toLocaleString("en-US")} deliveries</p>
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
              <span className="px-2 text-xs text-slate-600">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
    </div>
  );
}

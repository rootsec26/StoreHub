"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  Store,
  UserPlus,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import type { AdminUsersResponse } from "@/lib/messaging/types";

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  actorName: string | null;
  storeId: string | null;
  storeName: string | null;
  storeSlug: string | null;
  createdAt: string;
}

interface ActivityResponse {
  events: ActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
}

interface StoreOption {
  id: string;
  name: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Activity }> = {
  STORE_CREATED: { label: "Store", icon: Store },
  USER_REGISTERED: { label: "User", icon: UserPlus },
  PRODUCT_CREATED: { label: "Product", icon: Package },
  ORDER_CREATED: { label: "Order", icon: Activity },
  MESSAGE_SENT: { label: "Message", icon: Activity },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityManager() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [type, setType] = useState("");
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
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (storeId) params.set("storeId", storeId);
      if (type) params.set("type", type);
      const res = await fetch(`/api/admin/activity?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load activity");
      const data = (await res.json()) as ActivityResponse;
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, storeId, type]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Unified audit feed for store creation, registrations, products, orders and messages.
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
            placeholder="Search activity"
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
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
          className="w-40"
          aria-label="Filter by event type"
        >
          <option value="">All events</option>
          <option value="STORE_CREATED">Store created</option>
          <option value="USER_REGISTERED">User registered</option>
          <option value="PRODUCT_CREATED">Product added</option>
          <option value="ORDER_CREATED">Order placed</option>
          <option value="MESSAGE_SENT">Message sent</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ms-auto h-4 w-24" />
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
        ) : events.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Platform events will appear here as stores, users, products, orders and messages are created."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50">
                <tr>
                  {["Event", "Details", "Actor", "Store", "Date"].map((header) => (
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
                {events.map((event) => {
                  const meta = TYPE_META[event.type] ?? { label: event.type, icon: Activity };
                  const Icon = meta.icon;
                  return (
                    <tr key={event.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-slate-100 p-1.5 text-slate-500">
                            <Icon className="h-4 w-4" />
                          </span>
                          <Badge tone="indigo">{meta.label}</Badge>
                        </div>
                      </td>
                      <td className="max-w-[360px] px-4 py-3">
                        <p className="font-medium text-slate-900">{event.title}</p>
                        <p className="line-clamp-1 text-sm text-slate-500">{event.description}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{event.actorName || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {event.storeName ? (
                          <Link
                            href={`/admin/merchants`}
                            className="font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            {event.storeName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDate(event.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">{total.toLocaleString("en-US")} events</p>
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

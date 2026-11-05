"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Store, UserPlus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import type { AdminUsersResponse } from "@/lib/messaging/types";

const RECENT_DAYS = 7;

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UsersManager() {
  const searchParams = useSearchParams();

  const initialTab = searchParams.get("tab") === "recent" ? "recent" : "all";

  const [tab, setTab] = useState<"all" | "recent">(initialTab);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tab,
        days: String(RECENT_DAYS),
        page: String(page),
        limit: "25",
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (plan) params.set("plan", plan);

      const res = await fetch(`/api/admin/users?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load users");
      const payload = (await res.json()) as AdminUsersResponse;
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [tab, page, debouncedSearch, plan]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const counts = data?.counts;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All registered accounts. The Recent tab highlights signups from the
            last {RECENT_DAYS} days — those users still appear in All with a NEW
            badge.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {formatNumber(counts?.all ?? 0)} all
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <UserPlus className="h-3.5 w-3.5" />
            {formatNumber(counts?.recent ?? 0)} new
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
            {formatNumber(counts?.pro ?? 0)} pro
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
            {formatNumber(counts?.noStore ?? 0)} no store
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { id: "all", label: "All users", count: counts?.all },
            {
              id: "recent",
              label: `Recent (${RECENT_DAYS} days)`,
              count: counts?.recent,
            },
          ]}
          value={tab}
          onChange={(value) => {
            setTab(value as "all" | "recent");
            setPage(1);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              className="w-56 ps-9"
            />
          </div>
          <Select
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value);
              setPage(1);
            }}
            className="w-32"
            aria-label="Filter by plan"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
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
        ) : !data || data.users.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">No users match this view.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  {["User", "Store", "Plan", "Products", "Joined"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-900">
                            {user.name || "—"}
                          </p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                        {user.isNew && <Badge tone="emerald">NEW</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.store ? (
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900">
                              {user.store.name}
                            </p>
                            <p className="text-sm text-slate-500">
                              /{user.store.slug}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No store</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={user.store?.plan === "pro" ? "indigo" : "slate"}
                      >
                        {user.store?.plan === "pro" ? "Pro" : "Free"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatNumber(user.store?.productCount ?? 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {formatNumber(data.total)} users
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
    </div>
  );
}

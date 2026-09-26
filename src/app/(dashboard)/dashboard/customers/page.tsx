"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  Loader2,
  Wallet,
  RotateCcw,
  ReceiptText,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import type { CustomersResponse } from "@/lib/types";

export default function CustomersPage() {
  const { t, formatMoney, formatNumber, formatDate } = useI18n();

  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/customers")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: CustomersResponse | null) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lastEvent]);

  const filtered = useMemo(() => {
    const customers = data?.customers ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query)
    );
  }, [data, search]);

  const stats = [
    {
      label: t("customers.totalCustomers"),
      value: formatNumber(data?.summary.totalCustomers ?? 0),
      icon: Users,
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {
      label: t("customers.totalRevenue"),
      value: formatMoney(data?.summary.totalRevenue ?? "0"),
      icon: Wallet,
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: t("customers.repeatCustomers"),
      value: formatNumber(data?.summary.repeatCustomers ?? 0),
      icon: RotateCcw,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
    {
      label: t("customers.avgOrder"),
      value: formatMoney(data?.summary.avgOrderValue ?? "0"),
      icon: ReceiptText,
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-8 w-20 rounded bg-slate-200" />
              </div>
            ))
          : stats.map((card) => (
              <div
                key={card.label}
                className="rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">
                    {card.label}
                  </p>
                  <div className={`shrink-0 rounded-lg ${card.bgColor} p-2`}>
                    <card.icon className={`h-4 w-4 ${card.textColor}`} />
                  </div>
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">
                  {card.value}
                </p>
              </div>
            ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">{t("customers.subtitle")}</p>
        <div className="relative sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-4 flex animate-pulse items-center gap-4">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <Users className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("customers.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("customers.emptySubtitle")}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 text-start">{t("table.name")}</th>
                    <th className="px-6 py-4 text-start">{t("table.phone")}</th>
                    <th className="px-6 py-4 text-start">{t("table.orders")}</th>
                    <th className="px-6 py-4 text-start">
                      {t("table.totalSpent")}
                    </th>
                    <th className="px-6 py-4 text-start">
                      {t("table.lastOrder")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((customer) => (
                    <tr key={customer.phone} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {customer.name === "—" ? (
                          <span className="text-slate-400">
                            {t("customers.noPhone")}
                          </span>
                        ) : (
                          customer.name
                        )}
                      </td>
                      <td
                        className="px-6 py-4 text-sm text-slate-600"
                        dir="ltr"
                      >
                        {customer.phone || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatNumber(customer.totalOrders)}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {formatMoney(customer.totalSpent)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {customer.lastOrderAt
                          ? formatDate(customer.lastOrderAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {t("customers.showing", {
              count: filtered.length,
              total: data?.customers.length ?? filtered.length,
            })}
          </p>
        </>
      )}
    </div>
  );
}

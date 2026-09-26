"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingCart, ChevronDown, Loader2, RefreshCw } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import { ORDER_STATUSES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

/** Network-only fetch (no state) so effects can chain it without setState. */
async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await fetch("/api/orders");
    const data = await res.json();
    return data.orders || [];
  } catch (error) {
    console.error("Failed to load orders:", error);
    return [];
  }
}

export default function OrdersPage() {
  const { t, formatMoney, formatDateTime } = useI18n();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);
  const realtimeStatus = useOrdersRealtime((state) => state.status);

  const loadData = useCallback(async () => {
    setOrders(await fetchOrders());
  }, []);

  useEffect(() => {
    fetchOrders()
      .then((rows) => setOrders(rows))
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever realtime reports a change (INSERT/UPDATE/DELETE).
  useEffect(() => {
    if (!lastEvent) return;
    fetchOrders().then((rows) => setOrders(rows));
  }, [lastEvent]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function updateStatus(orderId: string, newStatus: string) {
    setUpdatingId(orderId);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      setToast(t("orders.toast.updated"));
      loadData();
    } catch {
      setToast(t("orders.toast.failed"));
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered =
    filterStatus === "all"
      ? orders
      : orders.filter((o) => o.status === filterStatus);

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            filterStatus === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t("orders.filterAll")}
        </button>
        {ORDER_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filterStatus === status
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t(`status.${status}` as TranslationKey)}
          </button>
        ))}

        <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-slate-400">
          {realtimeStatus === "connecting" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                realtimeStatus === "live"
                  ? "bg-emerald-500"
                  : realtimeStatus === "polling"
                    ? "bg-sky-500 animate-pulse"
                    : "bg-slate-300"
              }`}
            />
          )}
          {realtimeStatus === "live"
            ? t("orders.live")
            : realtimeStatus === "connecting"
              ? t("orders.connecting")
              : realtimeStatus === "polling"
                ? t("orders.polling")
                : ""}
        </span>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mb-4 flex animate-pulse items-center gap-4">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-4 w-32 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("orders.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("orders.emptySubtitle")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 text-start">{t("table.customer")}</th>
                  <th className="px-6 py-4 text-start">{t("table.phone")}</th>
                  <th className="px-6 py-4 text-start">{t("table.amount")}</th>
                  <th className="px-6 py-4 text-start">{t("table.status")}</th>
                  <th className="px-6 py-4 text-start">{t("table.update")}</th>
                  <th className="px-6 py-4 text-start">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {order.customerName}
                        </p>
                        {order.notes && (
                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                            {t("orders.notes")}: {order.notes}
                          </p>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-slate-600"
                      dir="ltr"
                    >
                      {order.customerPhone || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {formatMoney(order.totalAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            updateStatus(order.id, e.target.value)
                          }
                          disabled={updatingId === order.id}
                          className="appearance-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 pe-8 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {ORDER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {t(`status.${status}` as TranslationKey)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                        {updatingId === order.id && (
                          <Loader2 className="absolute end-6 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-indigo-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDateTime(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

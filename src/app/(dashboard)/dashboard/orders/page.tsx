"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart,
  ChevronDown,
  Loader2,
  RefreshCw,
  MessageCircle,
  Copy,
  Check,
  X,
  ShieldAlert,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import { ORDER_STATUSES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import CodVerificationBadge, {
  CodRiskBadge,
  riskReasonKey,
} from "@/components/CodVerificationBadge";
import { buildCodVerificationUrl, isCodOrder } from "@/lib/orders/cod-shared";

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  totalAmount: string;
  status: string;
  paymentMethod: string | null;
  codVerificationStatus: string;
  riskScore: string;
  riskReasons: string[];
  verifiedAt: string | null;
  verificationSentAt: string | null;
  createdAt: string;
}

interface OrdersPayload {
  orders: Order[];
  storeSlug?: string;
}

/** Network-only fetch (no state) so effects can chain it without setState. */
async function fetchOrders(): Promise<OrdersPayload> {
  try {
    const res = await fetch("/api/orders");
    const data = await res.json();
    return { orders: data.orders || [], storeSlug: data.storeSlug || "" };
  } catch (error) {
    console.error("Failed to load orders:", error);
    return { orders: [], storeSlug: "" };
  }
}

export default function OrdersPage() {
  const { t, locale, formatMoney, formatDateTime } = useI18n();

  const [orders, setOrders] = useState<Order[]>([]);
  const [storeSlug, setStoreSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);
  const realtimeStatus = useOrdersRealtime((state) => state.status);

  const loadData = useCallback(async () => {
    const payload = await fetchOrders();
    setOrders(payload.orders);
    if (payload.storeSlug) setStoreSlug(payload.storeSlug);
  }, []);

  useEffect(() => {
    fetchOrders()
      .then((payload) => {
        setOrders(payload.orders);
        if (payload.storeSlug) setStoreSlug(payload.storeSlug);
      })
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever realtime reports a change (INSERT/UPDATE/DELETE).
  useEffect(() => {
    if (!lastEvent) return;
    fetchOrders().then((payload) => setOrders(payload.orders));
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

  async function resendVerification(orderId: string) {
    setResendingId(orderId);
    try {
      const res = await fetch("/api/orders/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, locale }),
      });
      if (!res.ok) throw new Error("Failed to resend");
      setToast(t("orders.cod.resendSent"));
      loadData();
    } catch {
      setToast(t("orders.cod.resendFailed"));
    } finally {
      setResendingId(null);
    }
  }

  const verifyUrlFor = (orderId: string) =>
    buildCodVerificationUrl(
      storeSlug,
      orderId,
      typeof window !== "undefined" ? window.location.origin : undefined
    );

  async function copyVerifyLink(orderId: string) {
    if (!storeSlug) return;
    try {
      await navigator.clipboard.writeText(verifyUrlFor(orderId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const filtered =
    filterStatus === "all"
      ? orders
      : orders.filter((o) => o.status === filterStatus);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const statusSelect = (order: Order) => (
    <div className="relative">
      <select
        value={order.status}
        onChange={(e) => updateStatus(order.id, e.target.value)}
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
  );

  const resendButton = (order: Order) => {
    if (!isCodOrder(order) || order.codVerificationStatus === "VERIFIED") return null;
    const busy = resendingId === order.id;
    return (
      <button
        type="button"
        onClick={() => resendVerification(order.id)}
        disabled={busy}
        title={t("orders.cod.resend")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MessageCircle className="h-3.5 w-3.5" />
        )}
        <span className="hidden lg:inline">
          {busy ? t("orders.cod.resending") : t("orders.cod.resend")}
        </span>
      </button>
    );
  };

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
                  <th className="px-6 py-4 text-start">{t("table.cod")}</th>
                  <th className="px-6 py-4 text-start">{t("table.update")}</th>
                  <th className="px-6 py-4 text-start">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      setSelectedId(order.id);
                      setCopied(false);
                    }}
                  >
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
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-1.5">
                        <CodVerificationBadge order={order} />
                        {!isCodOrder(order) && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {resendButton(order)}
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      {statusSelect(order)}
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

      {/* COD verification / risk detail panel */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("orders.cod.details")}
                </h2>
                <p className="text-sm text-slate-500">{selected.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t("orders.cod.close")}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <CodVerificationBadge order={selected} />
              {isCodOrder(selected) && <CodRiskBadge score={selected.riskScore} />}
            </div>

            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("table.phone")}</dt>
                <dd className="font-medium text-slate-800" dir="ltr">
                  {selected.customerPhone || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">{t("orders.cod.address")}</dt>
                <dd className="text-end font-medium text-slate-800">
                  {selected.customerAddress || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("table.amount")}</dt>
                <dd className="font-medium text-slate-800">
                  {formatMoney(selected.totalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orders.cod.sentAt")}</dt>
                <dd className="font-medium text-slate-800">
                  {selected.verificationSentAt
                    ? formatDateTime(selected.verificationSentAt)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orders.cod.verifiedAt")}</dt>
                <dd className="font-medium text-slate-800">
                  {selected.verifiedAt ? formatDateTime(selected.verifiedAt) : "—"}
                </dd>
              </div>
            </dl>

            {selected.riskReasons?.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {t("orders.cod.riskReasons")}
                </p>
                <ul className="space-y-1">
                  {selected.riskReasons.map((reason) => {
                    const key = riskReasonKey(reason);
                    return (
                      <li key={reason} className="text-xs text-red-700">
                        • {key ? t(key) : reason}
                      </li>
                    );
                  })}
                </ul>
                {selected.riskScore === "HIGH" && (
                  <p className="mt-2 text-xs font-medium text-red-700">
                    {t("orders.cod.manualHint")}
                  </p>
                )}
              </div>
            )}

            {isCodOrder(selected) && storeSlug && (
              <div className="mb-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("orders.cod.verifyLink")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-xs text-slate-600" dir="ltr">
                    {verifyUrlFor(selected.id)}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyVerifyLink(selected.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t("orders.cod.linkCopied") : t("orders.cod.copyLink")}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {resendButton(selected)}
              <div onClick={(e) => e.stopPropagation()}>{statusSelect(selected)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

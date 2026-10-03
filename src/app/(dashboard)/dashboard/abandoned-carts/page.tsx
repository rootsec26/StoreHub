"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShoppingBag,
  Wallet,
  Percent,
  Timer,
  MessageCircle,
  CheckCircle2,
  Ban,
  PackageSearch,
  Loader2,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import { useNow } from "@/lib/promotions-hooks";
import {
  ABANDONED_CART_STATUS_CLASS,
  ABANDONED_CART_STATUS_LABEL,
  RECOVERY_COUPON_CODE,
  buildRecoveryCheckoutUrl,
  buildWhatsAppRecoveryText,
  buildWhatsAppRecoveryUrl,
  cartQuantity,
  type AbandonedCartRecord,
  type AbandonedCartStatus,
  type AbandonedCartsResponse,
} from "@/lib/abandoned-carts";

type StatusFilter = AbandonedCartStatus | "all";

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "pending",
  "recovered",
  "dismissed",
  "expired",
];

function elapsedLabel(
  iso: string,
  now: number,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("recovery.elapsed.justNow");
  if (minutes < 60) return t("recovery.elapsed.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("recovery.elapsed.hours", { count: hours });
  return t("recovery.elapsed.days", { count: Math.floor(hours / 24) });
}

async function fetchAbandonedCarts(): Promise<AbandonedCartsResponse | null> {
  try {
    const res = await fetch("/api/abandoned-carts", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AbandonedCartsResponse;
  } catch {
    return null;
  }
}

export default function AbandonedCartsPage() {
  const { t, locale, formatMoney, formatNumber, formatDateTime } = useI18n();

  const [data, setData] = useState<AbandonedCartsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);
  const now = useNow(30000);

  async function loadData() {
    const payload = await fetchAbandonedCarts();
    if (payload) setData(payload);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    fetchAbandonedCarts()
      .then((payload) => {
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

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const carts = useMemo(() => data?.carts ?? [], [data]);
  const summary = data?.summary;
  const storeSlug = data?.storeSlug ?? "";

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return carts.filter((cart) => {
      if (statusFilter !== "all" && cart.status !== statusFilter) return false;
      if (!query) return true;
      return (
        cart.customerName.toLowerCase().includes(query) ||
        cart.customerPhone.toLowerCase().includes(query) ||
        cart.customerEmail.toLowerCase().includes(query) ||
        cart.cartItems.some((item) => item.name.toLowerCase().includes(query))
      );
    });
  }, [carts, search, statusFilter]);

  const metrics = [
    {
      label: t("recovery.metric.totalAbandonedValue"),
      value: formatMoney(summary?.totalAbandonedValue ?? "0"),
      icon: ShoppingBag,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
    {
      label: t("recovery.metric.recoveredRevenue"),
      value: formatMoney(summary?.recoveredRevenue ?? "0"),
      icon: Wallet,
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: t("recovery.metric.recoveryRate"),
      value: `${formatNumber(summary?.recoveryRate ?? 0)}%`,
      icon: Percent,
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {
      label: t("recovery.metric.activePendingCarts"),
      value: formatNumber(summary?.activePendingCarts ?? 0),
      icon: Timer,
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
  ];

  function buildLink(cart: AbandonedCartRecord): string | null {
    if (typeof window === "undefined") return null;
    const text = buildWhatsAppRecoveryText(
      {
        customerName: cart.customerName,
        itemQuantity: cartQuantity(cart.cartItems),
        checkoutUrl: buildRecoveryCheckoutUrl(
          window.location.origin,
          storeSlug,
          cart.recoveryToken
        ),
      },
      locale
    );
    return buildWhatsAppRecoveryUrl(cart.customerPhone, text);
  }

  function openWhatsApp(cart: AbandonedCartRecord) {
    const link = buildLink(cart);
    if (!link) {
      setToast(t("recovery.toast.noPhone"));
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  }

  async function updateStatus(cart: AbandonedCartRecord, status: AbandonedCartStatus) {
    if (updatingId) return;
    setUpdatingId(cart.id);
    try {
      const res = await fetch("/api/abandoned-carts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cart.id, status }),
      });
      if (!res.ok) throw new Error("Update failed");
      setToast(
        t(
          status === "recovered"
            ? "recovery.toast.recovered"
            : status === "dismissed"
              ? "recovery.toast.dismissed"
              : "recovery.toast.updated"
        )
      );
      await loadData();
    } catch {
      setToast(t("recovery.toast.error"));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Metric cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="mt-3 h-8 w-24 rounded bg-slate-200" />
              </div>
            ))
          : metrics.map((card) => (
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

      {/* WhatsApp template hint */}
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("recovery.templateHint", { code: RECOVERY_COUPON_CODE })}</p>
      </div>

      {/* Search + status filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === filter
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
              }`}
            >
              {t(
                filter === "all"
                  ? "recovery.filter.all"
                  : ABANDONED_CART_STATUS_LABEL[filter]
              )}
            </button>
          ))}
        </div>

        <div className="relative lg:max-w-xs lg:w-full">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("recovery.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Carts table */}
      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-4 flex animate-pulse items-center gap-4">
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-4 w-20 rounded bg-slate-200" />
              <div className="h-4 w-24 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <PackageSearch className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("recovery.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("recovery.emptySubtitle")}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 text-start">
                      {t("recovery.table.customer")}
                    </th>
                    <th className="px-6 py-4 text-start">
                      {t("recovery.table.items")}
                    </th>
                    <th className="px-6 py-4 text-start">
                      {t("recovery.table.total")}
                    </th>
                    <th className="px-6 py-4 text-start">
                      {t("recovery.table.elapsed")}
                    </th>
                    <th className="px-6 py-4 text-start">
                      {t("recovery.table.status")}
                    </th>
                    <th className="px-6 py-4 text-end">
                      {t("recovery.table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((cart) => {
                    const waLink = buildLink(cart);
                    const busy = updatingId === cart.id;

                    return (
                      <tr key={cart.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">
                            {cart.customerName || t("recovery.guest")}
                          </p>
                          <p className="text-xs text-slate-500" dir="ltr">
                            {cart.customerPhone || cart.customerEmail || "—"}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <div className="max-w-[16rem]">
                            <p className="truncate text-sm text-slate-700">
                              {cart.cartItems
                                .slice(0, 2)
                                .map((item) => item.name)
                                .join("، ")}
                              {cart.cartItems.length > 2
                                ? ` +${cart.cartItems.length - 2}`
                                : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t("recovery.itemsCount", {
                                count: cartQuantity(cart.cartItems),
                              })}
                            </p>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {formatMoney(cart.totalAmount)}
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {now === null
                            ? "—"
                            : elapsedLabel(cart.createdAt, now, t)}
                          <p className="text-xs text-slate-400">
                            {formatDateTime(cart.createdAt)}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              ABANDONED_CART_STATUS_CLASS[cart.status]
                            }`}
                          >
                            {t(ABANDONED_CART_STATUS_LABEL[cart.status])}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openWhatsApp(cart)}
                              disabled={!waLink}
                              title={
                                waLink
                                  ? t("recovery.action.whatsapp")
                                  : t("recovery.whatsappMissing")
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              {t("recovery.action.whatsapp")}
                            </button>

                            {cart.status !== "recovered" && (
                              <button
                                type="button"
                                onClick={() => updateStatus(cart, "recovered")}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                {t("recovery.action.recover")}
                              </button>
                            )}

                            {cart.status === "pending" && (
                              <button
                                type="button"
                                onClick={() => updateStatus(cart, "dismissed")}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                {t("recovery.action.dismiss")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {t("recovery.showing", {
              count: filtered.length,
              total: carts.length,
            })}
          </p>
        </>
      )}
    </div>
  );
}

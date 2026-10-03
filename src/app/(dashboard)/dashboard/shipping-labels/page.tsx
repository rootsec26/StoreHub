"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { getValidNextStatuses } from "@/lib/order-state-machine";
import type { OrderStatus } from "@/lib/types";
import { useOrdersRealtime } from "@/lib/realtime";
import {
  SHIPPING_CARRIERS,
  SHIPMENT_FILTERS,
  type ShippingLabelStore,
  type ShippingOrderRecord,
} from "@/lib/shipping";

type FilterKey = "ready" | "transit" | "delivered" | "all";
type BusyAction = "fulfill" | "refresh" | "cancel" | "carrier" | null;

interface CarrierDraft {
  carrier: (typeof SHIPPING_CARRIERS)[number];
  apiKey: string;
  apiSecret: string;
  governorates: string;
}

interface IntegrationRecord {
  id: string;
  carrier: string;
  carrierLabel: string;
  isActive: boolean;
  defaultForGovernorates: string[];
  hasApiKey: boolean;
  hasApiSecret: boolean;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

const FILTERS: { key: FilterKey; labelKey: TranslationKey }[] = [
  { key: "ready", labelKey: "hub.filter.ready" },
  { key: "transit", labelKey: "hub.filter.transit" },
  { key: "delivered", labelKey: "hub.filter.delivered" },
  { key: "all", labelKey: "hub.filter.all" },
];

const SHIP_STATUS_STYLES: Record<string, string> = {
  UNFULFILLED: "bg-amber-100 text-amber-800",
  LABEL_CREATED: "bg-indigo-100 text-indigo-800",
  PICKED_UP: "bg-cyan-100 text-cyan-800",
  OUT_FOR_DELIVERY: "bg-sky-100 text-sky-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  RETURNED: "bg-red-100 text-red-800",
};

async function fetchHub(filter: FilterKey) {
  try {
    const res = await fetch(`/api/shipping?filter=${filter}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      store: (data.store as ShippingLabelStore | undefined) ?? null,
      orders: Array.isArray(data.orders) ? (data.orders as ShippingOrderRecord[]) : [],
      counts: data.counts as Record<FilterKey, number> | undefined,
    };
  } catch (error) {
    console.error("Failed to load shipping hub:", error);
    return null;
  }
}

async function fetchIntegrations(): Promise<IntegrationRecord[]> {
  try {
    const res = await fetch("/api/shipping/integrations", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.integrations) ? data.integrations : [];
  } catch {
    return [];
  }
}

/**
 * Centralized shipping hub: fulfillment filters, bulk AWB generation and
 * carrier connections for the multi-carrier routing engine.
 */
export default function ShippingLabelsPage() {
  const { t, formatDateTime } = useI18n();

  const [filter, setFilter] = useState<FilterKey>("ready");
  const [orders, setOrders] = useState<ShippingOrderRecord[]>([]);
  const [store, setStore] = useState<ShippingLabelStore | null>(null);
  const [counts, setCounts] = useState<Partial<Record<FilterKey, number>>>({});
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadedFilter, setLoadedFilter] = useState<FilterKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Carrier connect form
  const [showCarrierForm, setShowCarrierForm] = useState(false);
  const [carrierDraft, setCarrierDraft] = useState<CarrierDraft>({
    carrier: SHIPPING_CARRIERS[0],
    apiKey: "",
    apiSecret: "",
    governorates: "",
  });

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);

  const showToast = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const applyData = useCallback(
    (hub: Awaited<ReturnType<typeof fetchHub>>, carrierRows: IntegrationRecord[]) => {
      if (hub) {
        setOrders(hub.orders);
        if (hub.store) setStore(hub.store);
        if (hub.counts) setCounts(hub.counts);
        setSelected((current) =>
          current.filter((id) => hub.orders.some((order) => order.id === id))
        );
      }
      setIntegrations(carrierRows);
      setLoadedFilter(filter);
    },
    [filter]
  );

  const load = useCallback(async () => {
    try {
      const [hub, carrierRows] = await Promise.all([
        fetchHub(filter),
        fetchIntegrations(),
      ]);
      applyData(hub, carrierRows);
    } catch (error) {
      console.error("Failed to load shipping hub:", error);
    }
  }, [filter, applyData]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchHub(filter), fetchIntegrations()])
      .then(([hub, carrierRows]) => {
        if (!cancelled) applyData(hub, carrierRows);
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to load shipping hub:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, applyData, lastEvent]);

  const loading = loadedFilter !== filter;

  const allSelected =
    orders.length > 0 && orders.every((order) => selected.includes(order.id));

  function toggleSelect(orderId: string) {
    setSelected((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    );
  }

  function toggleSelectAll() {
    setSelected(allSelected ? [] : orders.map((order) => order.id));
  }

  /** Bulk fulfillment: book shipments + open the merged printable PDF. */
  async function handleFulfillAndPrint() {
    const ids = selected.length > 0 ? selected : orders.map((order) => order.id);
    if (ids.length === 0) {
      showToast(t("hub.toast.selectFirst"));
      return;
    }

    setBusy("fulfill");
    try {
      const res = await fetch("/api/shipping/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: ids }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.error || "fulfillment failed");
      }

      const fulfilled = Number(data.fulfilledCount) || 0;
      const failed = Number(data.failedCount) || 0;
      setSelected([]);

      if (data.bulkLabelUrl) {
        window.open(data.bulkLabelUrl, "_blank", "noopener,noreferrer");
      }

      showToast(
        failed > 0
          ? t("hub.toast.fulfilledWithErrors", { count: fulfilled, failed })
          : t("hub.toast.fulfilled", { count: fulfilled })
      );
      await load();
    } catch (error) {
      console.error("Bulk fulfillment failed:", error);
      showToast(t("hub.toast.fulfillFailed"));
    } finally {
      setBusy(null);
    }
  }

  function openTrack(order: ShippingOrderRecord) {
    if (!store) return;
    window.open(`/store/${store.slug}/track/${order.id}`, "_blank", "noopener,noreferrer");
  }

  function openLabel(order: ShippingOrderRecord) {
    const url = order.airwayBillUrl || `/api/shipping/awb/${order.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleCancel(order: ShippingOrderRecord) {
    if (!window.confirm(t("hub.cancelConfirm", { id: order.id.slice(0, 8) }))) return;

    setBusy("cancel");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status: "Cancelled" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "cancel failed");
      }
      showToast(t("hub.toast.cancelled"));
      await load();
    } catch (error) {
      console.error("Cancel shipment failed:", error);
      showToast(t("hub.toast.cancelFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleCarrier(integration: IntegrationRecord) {
    const previous = integrations;
    setIntegrations((current) =>
      current.map((entry) =>
        entry.id === integration.id ? { ...entry, isActive: !entry.isActive } : entry
      )
    );
    try {
      const res = await fetch("/api/shipping/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: integration.id, isActive: !integration.isActive }),
      });
      if (!res.ok) throw new Error("update failed");
      showToast(t("hub.carriers.toast.updated"));
    } catch {
      setIntegrations(previous);
      showToast(t("hub.carriers.toast.updateFailed"));
    }
  }

  async function removeCarrier(integration: IntegrationRecord) {
    if (!window.confirm(t("hub.carriers.deleteConfirm"))) return;
    const previous = integrations;
    setIntegrations((current) => current.filter((entry) => entry.id !== integration.id));
    try {
      const res = await fetch(
        `/api/shipping/integrations?id=${encodeURIComponent(integration.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("delete failed");
      showToast(t("hub.carriers.toast.deleted"));
    } catch {
      setIntegrations(previous);
      showToast(t("hub.carriers.toast.deleteFailed"));
    }
  }

  async function connectCarrier(event: React.FormEvent) {
    event.preventDefault();
    setBusy("carrier");
    try {
      const res = await fetch("/api/shipping/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier: carrierDraft.carrier,
          apiKey: carrierDraft.apiKey.trim() || undefined,
          apiSecret: carrierDraft.apiSecret.trim() || undefined,
          defaultForGovernorates: carrierDraft.governorates
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = await res.json();
      if (data.integration) {
        setIntegrations((current) => [...current, data.integration as IntegrationRecord]);
      }
      setCarrierDraft({ carrier: SHIPPING_CARRIERS[0], apiKey: "", apiSecret: "", governorates: "" });
      setShowCarrierForm(false);
      showToast(t("hub.carriers.toast.created"));
    } catch (error) {
      console.error("Connect carrier failed:", error);
      showToast(t("hub.carriers.toast.createFailed"));
    } finally {
      setBusy(null);
    }
  }

  const countFor = useCallback(
    (key: FilterKey) => counts[key] ?? (key === filter ? orders.length : 0),
    [counts, filter, orders.length]
  );

  const emptyState = useMemo(() => {
    switch (filter) {
      case "transit":
        return { title: t("hub.empty.transit.title"), subtitle: t("hub.empty.transit.subtitle") };
      case "delivered":
        return {
          title: t("hub.empty.delivered.title"),
          subtitle: t("hub.empty.delivered.subtitle"),
        };
      case "all":
        return { title: t("hub.empty.all.title"), subtitle: t("hub.empty.all.subtitle") };
      default:
        return { title: t("hub.empty.ready.title"), subtitle: t("hub.empty.ready.subtitle") };
    }
  }, [filter, t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("hub.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("hub.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing || loading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </div>

      {/* Filters + bulk action */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => {
                setFilter(entry.key);
                setSelected([]);
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                filter === entry.key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(entry.labelKey)}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  filter === entry.key
                    ? "bg-white/20 text-white"
                    : "bg-white text-slate-500"
                }`}
              >
                {countFor(entry.key)}
              </span>
            </button>
          ))}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              {selected.length > 0
                ? t("hub.selected", { count: selected.length })
                : t("hub.selectionHint")}
            </span>
            <button
              type="button"
              onClick={() => void handleFulfillAndPrint()}
              disabled={busy === "fulfill"}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy === "fulfill" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {busy === "fulfill"
                ? t("hub.fulfilling")
                : t("hub.generateBulk")}
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">{t("hub.routingNote")}</p>
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <PackageCheck className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{emptyState.title}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {emptyState.subtitle}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label={t("hub.selectAll")}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-start">{t("hub.col.order")}</th>
                  <th className="px-4 py-3 text-start">{t("hub.col.customer")}</th>
                  <th className="px-4 py-3 text-start">{t("hub.col.carrier")}</th>
                  <th className="px-4 py-3 text-start">{t("hub.col.tracking")}</th>
                  <th className="px-4 py-3 text-start">{t("hub.col.eta")}</th>
                  <th className="px-4 py-3 text-start">{t("hub.col.status")}</th>
                  <th className="px-4 py-3 text-end">{t("hub.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const isSelected = selected.includes(order.id);
                  return (
                    <tr
                      key={order.id}
                      className={isSelected ? "bg-indigo-50/40" : "hover:bg-slate-50"}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(order.id)}
                          aria-label={t("hub.selectOrder", { id: order.id.slice(0, 8) })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900" dir="ltr">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(order.createdAt)} ·{" "}
                          {t("hub.itemsCount", { count: order.itemsCount })}
                        </p>
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <p className="truncate font-medium text-slate-700">
                          {order.customerName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {order.customerAddress || order.zoneName || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {order.carrierName || order.courierName || (
                          <span className="text-slate-400">{t("hub.noCarrier")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {order.trackingNumber ? (
                          <span className="font-mono text-xs text-slate-700">
                            {order.trackingNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{t("hub.noTracking")}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {order.estimatedDeliveryAt
                          ? formatDateTime(order.estimatedDeliveryAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            SHIP_STATUS_STYLES[order.shippingStatus] ||
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {t(`hub.shipStatus.${order.shippingStatus}` as never)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openLabel(order)}
                            title={t("hub.action.label")}
                            aria-label={t("hub.action.label")}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openTrack(order)}
                            title={t("hub.action.track")}
                            aria-label={t("hub.action.track")}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCancel(order)}
                            disabled={
                              busy === "cancel" ||
                              !getValidNextStatuses(order.status as OrderStatus).includes(
                                "Cancelled"
                              )
                            }
                            title={t("hub.action.cancel")}
                            aria-label={t("hub.action.cancel")}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {orders.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{t("hub.showing", { count: orders.length })}</span>
            <span>
              {selected.length > 0 ? t("hub.selected", { count: selected.length }) : t("hub.bulkHint")}
            </span>
          </div>
        )}
      </div>

      {/* Carrier connections */}
      <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("hub.carriers.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("hub.carriers.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCarrierForm((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {showCarrierForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCarrierForm ? t("common.cancel") : t("hub.carriers.add")}
          </button>
        </div>

        {showCarrierForm && (
          <form
            onSubmit={(event) => void connectCarrier(event)}
            className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
          >
            <div>
              <label className={labelClass} htmlFor="carrier-select">
                {t("hub.carriers.field.carrier")}
              </label>
              <select
                id="carrier-select"
                value={carrierDraft.carrier}
                onChange={(event) =>
                  setCarrierDraft((current) => ({
                    ...current,
                    carrier: event.target.value as (typeof SHIPPING_CARRIERS)[number],
                  }))
                }
                className={inputClass}
              >
                {SHIPPING_CARRIERS.map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="carrier-governorates">
                {t("hub.carriers.field.governorates")}
              </label>
              <input
                id="carrier-governorates"
                type="text"
                value={carrierDraft.governorates}
                onChange={(event) =>
                  setCarrierDraft((current) => ({
                    ...current,
                    governorates: event.target.value,
                  }))
                }
                placeholder={t("hub.carriers.field.governoratesHint")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="carrier-api-key">
                {t("hub.carriers.field.apiKey")}
              </label>
              <input
                id="carrier-api-key"
                type="password"
                autoComplete="off"
                value={carrierDraft.apiKey}
                onChange={(event) =>
                  setCarrierDraft((current) => ({ ...current, apiKey: event.target.value }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="carrier-api-secret">
                {t("hub.carriers.field.apiSecret")}
              </label>
              <input
                id="carrier-api-secret"
                type="password"
                autoComplete="off"
                value={carrierDraft.apiSecret}
                onChange={(event) =>
                  setCarrierDraft((current) => ({ ...current, apiSecret: event.target.value }))
                }
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy === "carrier"}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "carrier" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("hub.carriers.save")}
              </button>
            </div>
          </form>
        )}

        {integrations.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            {t("hub.carriers.empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {integrations.map((integration) => (
              <li
                key={integration.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    integration.isActive
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Truck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{integration.carrierLabel}</p>
                  <p className="truncate text-xs text-slate-500">
                    {integration.defaultForGovernorates.length > 0
                      ? integration.defaultForGovernorates.join(" · ")
                      : t("hub.carriers.allGovernorates")}
                    {" · "}
                    {integration.hasApiKey
                      ? t("hub.carriers.credentialsSaved")
                      : t("hub.carriers.sandboxMode")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleCarrier(integration)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    integration.isActive ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  role="switch"
                  aria-checked={integration.isActive}
                  aria-label={t("hub.carriers.toggle")}
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform ${
                      integration.isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  >
                    {integration.isActive && <Check className="h-3 w-3 text-emerald-600" />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void removeCarrier(integration)}
                  aria-label={t("hub.carriers.remove")}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock3,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import StatusBadge from "@/components/StatusBadge";
import ThermalLabelModal from "@/components/shipping/ThermalLabelModal";
import {
  COURIER_OPTIONS,
  ZONE_PRESETS,
  type ShippingLabelStore,
  type ShippingOrderRecord,
  type ShippingZoneRecord,
} from "@/lib/shipping";

type TabKey = "zones" | "orders";
type BusyAction = "create" | "ship" | "labels" | null;

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";
const cellSelectClass =
  "appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pe-7 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

interface ZonePayload {
  zoneName: string;
  rate: number;
  estimatedDeliveryDays: number;
}

interface ZoneDraft {
  zoneName: string;
  rate: string;
  estimatedDeliveryDays: number;
}

interface ShippingQueuePayload {
  store: ShippingLabelStore | null;
  orders: ShippingOrderRecord[];
}

/** Network-only fetchers (no state) so effects can chain them safely. */
async function fetchShippingQueue(): Promise<ShippingQueuePayload | null> {
  try {
    const res = await fetch("/api/shipping", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      store: (data.store as ShippingLabelStore | undefined) ?? null,
      orders: Array.isArray(data.orders) ? data.orders : [],
    };
  } catch (error) {
    console.error("Failed to load shipping queue:", error);
    return null;
  }
}

async function fetchShippingZones(): Promise<ShippingZoneRecord[] | null> {
  try {
    const res = await fetch("/api/shipping/zones", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.zones) ? data.zones : null;
  } catch (error) {
    console.error("Failed to load shipping zones:", error);
    return null;
  }
}

export default function ShippingPage() {
  const { t, formatMoney, formatDateTime } = useI18n();

  const [tab, setTab] = useState<TabKey>("zones");
  const [zones, setZones] = useState<ShippingZoneRecord[]>([]);
  const [orders, setOrders] = useState<ShippingOrderRecord[]>([]);
  const [store, setStore] = useState<ShippingLabelStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [courier, setCourier] = useState("");
  const [labelOrders, setLabelOrders] = useState<ShippingOrderRecord[] | null>(null);

  // Zone builder
  const [zoneName, setZoneName] = useState("");
  const [zoneRate, setZoneRate] = useState("");
  const [zoneDays, setZoneDays] = useState("2");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ZoneDraft | null>(null);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);

  const showToast = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Load on mount and refresh whenever realtime reports an order change.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [queue, zoneList] = await Promise.all([
          fetchShippingQueue(),
          fetchShippingZones(),
        ]);
        if (cancelled) return;

        if (queue) {
          setOrders(queue.orders);
          if (queue.store) setStore(queue.store);
          setSelected((current) =>
            current.filter((id) => queue.orders.some((order) => order.id === id))
          );
        }
        if (zoneList) setZones(zoneList);
      } catch (error) {
        console.error("Failed to load shipping data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [lastEvent]);

  /** Refresh helper used by bulk-action handlers (never called from effects). */
  const loadData = useCallback(async () => {
    const [queue, zoneList] = await Promise.all([
      fetchShippingQueue(),
      fetchShippingZones(),
    ]);
    if (queue) {
      setOrders(queue.orders);
      if (queue.store) setStore(queue.store);
      setSelected((current) =>
        current.filter((id) => queue.orders.some((order) => order.id === id))
      );
    }
    if (zoneList) setZones(zoneList);
  }, []);

  // ---------------------------------------------------------------
  // Shipping zones CRUD (optimistic)
  // ---------------------------------------------------------------
  async function createZone(payload: ZonePayload): Promise<boolean> {
    const res = await fetch("/api/shipping/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.zone) {
      setZones((current) => [...current, data.zone as ShippingZoneRecord]);
    }
    return true;
  }

  async function handleCreateZone(event: React.FormEvent) {
    event.preventDefault();

    const name = zoneName.trim();
    const rate = Number(zoneRate);
    const days = Number(zoneDays);

    if (!name) {
      showToast(t("shipping.zones.error.name"));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      showToast(t("shipping.zones.error.rate"));
      return;
    }

    setBusy("create");
    try {
      const created = await createZone({
        zoneName: name,
        rate: Math.round(rate * 100) / 100,
        estimatedDeliveryDays: Math.min(90, Math.max(1, Math.round(days) || 2)),
      });
      if (!created) throw new Error("create failed");
      setZoneName("");
      setZoneRate("");
      setZoneDays("2");
      showToast(t("shipping.zones.toast.created"));
    } catch {
      showToast(t("shipping.zones.toast.createFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handlePreset(preset: (typeof ZONE_PRESETS)[number]) {
    setBusy("create");
    try {
      const created = await createZone({
        zoneName: preset.name,
        rate: preset.rate,
        estimatedDeliveryDays: preset.days,
      });
      if (!created) throw new Error("create failed");
      showToast(t("shipping.zones.toast.created"));
    } catch {
      showToast(t("shipping.zones.toast.createFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleZone(zone: ShippingZoneRecord) {
    const previous = zones;
    const isActive = !zone.isActive;
    setZones((current) =>
      current.map((entry) => (entry.id === zone.id ? { ...entry, isActive } : entry))
    );

    try {
      const res = await fetch("/api/shipping/zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zone.id, isActive }),
      });
      if (!res.ok) throw new Error("update failed");
      showToast(t("shipping.zones.toast.updated"));
    } catch {
      setZones(previous);
      showToast(t("shipping.zones.toast.updateFailed"));
    }
  }

  async function saveZoneEdit() {
    if (!editingId || !draft) return;

    const name = draft.zoneName.trim();
    const rate = Number(draft.rate);
    const days = Number(draft.estimatedDeliveryDays);

    if (!name) {
      showToast(t("shipping.zones.error.name"));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      showToast(t("shipping.zones.error.rate"));
      return;
    }

    const previous = zones;
    const optimized: ZonePayload = {
      zoneName: name,
      rate: Math.round(rate * 100) / 100,
      estimatedDeliveryDays: Math.min(90, Math.max(1, Math.round(days) || 2)),
    };

    setZones((current) =>
      current.map((entry) =>
        entry.id === editingId
          ? {
              ...entry,
              zoneName: optimized.zoneName,
              rate: optimized.rate.toFixed(2),
              estimatedDeliveryDays: optimized.estimatedDeliveryDays,
            }
          : entry
      )
    );
    setEditingId(null);
    setDraft(null);

    try {
      const res = await fetch("/api/shipping/zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...optimized }),
      });
      if (!res.ok) throw new Error("update failed");
      showToast(t("shipping.zones.toast.updated"));
    } catch {
      setZones(previous);
      showToast(t("shipping.zones.toast.updateFailed"));
    }
  }

  async function deleteZone(zone: ShippingZoneRecord) {
    if (!window.confirm(t("shipping.zones.deleteConfirm"))) return;

    const previous = zones;
    setZones((current) => current.filter((entry) => entry.id !== zone.id));

    try {
      const res = await fetch(`/api/shipping/zones?id=${encodeURIComponent(zone.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      setOrders((current) =>
        current.map((order) =>
          order.shippingZoneId === zone.id
            ? { ...order, shippingZoneId: null, zoneName: null }
            : order
        )
      );
      showToast(t("shipping.zones.toast.deleted"));
    } catch {
      setZones(previous);
      showToast(t("shipping.zones.toast.deleteFailed"));
    }
  }

  // ---------------------------------------------------------------
  // Fulfillment queue (multi-select + bulk actions)
  // ---------------------------------------------------------------
  const allSelected =
    orders.length > 0 && orders.every((order) => selected.includes(order.id));

  function toggleAll() {
    setSelected(allSelected ? [] : orders.map((order) => order.id));
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  async function assignZone(orderId: string, zoneId: string) {
    const previous = orders;
    const zoneName = zones.find((zone) => zone.id === zoneId)?.zoneName ?? null;
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, shippingZoneId: zoneId || null, zoneName: zoneId ? zoneName : null }
          : order
      )
    );

    try {
      const res = await fetch("/api/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assignZone",
          orderId,
          shippingZoneId: zoneId || null,
        }),
      });
      if (!res.ok) throw new Error("assign failed");
      showToast(t("shipping.orders.toast.zoneAssigned"));
    } catch {
      setOrders(previous);
      showToast(t("shipping.orders.toast.zoneFailed"));
    }
  }

  async function handlePrintLabels() {
    if (selected.length === 0) {
      showToast(t("shipping.orders.error.selectFirst"));
      return;
    }

    setBusy("labels");
    try {
      const res = await fetch("/api/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepareLabels", orderIds: selected }),
      });
      if (!res.ok) throw new Error("prepare failed");

      const data = (await res.json()) as { orders?: ShippingOrderRecord[] };
      const updates = new Map((data.orders ?? []).map((order) => [order.id, order]));

      const next = orders.map((order) => {
        const update = updates.get(order.id);
        return update
          ? {
              ...order,
              trackingNumber: update.trackingNumber ?? order.trackingNumber,
              courierName: update.courierName ?? order.courierName,
              labelPrintedAt: update.labelPrintedAt ?? order.labelPrintedAt,
            }
          : order;
      });
      setOrders(next);

      const printable = selected
        .map((id) => next.find((order) => order.id === id))
        .filter((order): order is ShippingOrderRecord =>
          Boolean(order?.trackingNumber)
        );

      if (printable.length === 0) throw new Error("no labels");

      setLabelOrders(printable);
      showToast(t("shipping.orders.toast.labelsReady", { count: printable.length }));
    } catch {
      showToast(t("shipping.orders.toast.labelsFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleMarkShipped() {
    if (selected.length === 0) {
      showToast(t("shipping.orders.error.selectFirst"));
      return;
    }

    const ids = [...selected];
    const snapshot = orders;

    setBusy("ship");
    setOrders((current) => current.filter((order) => !ids.includes(order.id)));
    setSelected([]);

    try {
      const res = await fetch("/api/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markShipped",
          orderIds: ids,
          ...(courier ? { courierName: courier } : {}),
        }),
      });
      if (!res.ok) throw new Error("ship failed");
      showToast(t("shipping.orders.toast.shipped", { count: ids.length }));
      void loadData();
    } catch {
      setOrders(snapshot);
      setSelected(ids);
      showToast(t("shipping.orders.toast.shipFailed"));
    } finally {
      setBusy(null);
    }
  }

  function handleLabelsPrinted(orderIds: string[]) {
    if (orderIds.length === 0) return;
    const printedAt = new Date().toISOString();
    setOrders((current) =>
      current.map((order) =>
        orderIds.includes(order.id) ? { ...order, labelPrintedAt: printedAt } : order
      )
    );

    fetch("/api/shipping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markLabelsPrinted", orderIds }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("record failed");
      })
      .catch((error) => {
        console.error("Failed to record printed labels:", error);
      });
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  const tabs: { key: TabKey; label: string; icon: typeof MapPin; count: number }[] = [
    { key: "zones", label: t("shipping.tab.zones"), icon: MapPin, count: zones.length },
    { key: "orders", label: t("shipping.tab.orders"), icon: Truck, count: orders.length },
  ];

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <p className="mb-6 text-sm text-slate-500">{t("shipping.subtitle")}</p>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            aria-pressed={tab === entry.key}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === entry.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            <entry.icon className="h-4 w-4" />
            {entry.label}
            {entry.count > 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                  tab === entry.key
                    ? "bg-white/20 text-white"
                    : entry.key === "orders"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {entry.count > 99 ? "99+" : entry.count}
              </span>
            )}
          </button>
        ))}
      </div>

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
      ) : tab === "zones" ? (
        /* ------------------------------------------------------------------
           Tab 1 — Shipping zones & rates
           ------------------------------------------------------------------ */
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <form onSubmit={handleCreateZone} className="h-fit rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <MapPin className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t("shipping.zones.add")}
                </h3>
                <p className="text-xs text-slate-500">{t("shipping.zones.subtitle")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>{t("shipping.zones.field.name")}</label>
                <input
                  type="text"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder={t("shipping.zones.field.namePlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("shipping.zones.field.rate")}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={zoneRate}
                    onChange={(e) => setZoneRate(e.target.value)}
                    placeholder="50"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("shipping.zones.field.days")}</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={zoneDays}
                    onChange={(e) => setZoneDays(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy === "create"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "create" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("shipping.zones.add")}
              </button>

              {zones.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("shipping.zones.presets")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ZONE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handlePreset(preset)}
                        disabled={busy === "create"}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                      >
                        {preset.name} · {preset.rate} EGP
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </form>

          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t("shipping.zones.title")}
                </h3>
                <p className="text-xs text-slate-500">{t("shipping.zones.subtitle")}</p>
              </div>
              <Clock3 className="h-5 w-5 text-slate-400" />
            </div>

            {zones.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  {t("shipping.zones.emptyTitle")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("shipping.zones.emptySubtitle")}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {zones.map((zone) => {
                  const isEditing = editingId === zone.id;

                  return (
                    <li key={zone.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          zone.isActive ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <MapPin className="h-5 w-5" />
                      </div>

                      {isEditing && draft ? (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={draft.zoneName}
                            onChange={(e) =>
                              setDraft({ ...draft, zoneName: e.target.value })
                            }
                            className={`${inputClass} min-w-32 flex-1 py-1.5 text-sm`}
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={draft.rate}
                            onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                            className={`${inputClass} w-24 py-1.5 text-sm`}
                          />
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={draft.estimatedDeliveryDays}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                estimatedDeliveryDays: Number(e.target.value),
                              })
                            }
                            className={`${inputClass} w-20 py-1.5 text-sm`}
                          />
                          <button
                            type="button"
                            onClick={saveZoneEdit}
                            className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700"
                            aria-label={t("common.save")}
                            title={t("common.save")}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                            aria-label={t("common.cancel")}
                            title={t("common.cancel")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium text-slate-900">
                                {zone.zoneName}
                              </p>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  zone.isActive
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {zone.isActive
                                  ? t("shipping.zones.active")
                                  : t("shipping.zones.inactive")}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {t("shipping.zones.eta", {
                                days: zone.estimatedDeliveryDays,
                              })}
                            </p>
                          </div>

                          <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold tabular-nums text-white">
                            {formatMoney(zone.rate)}
                          </span>

                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={zone.isActive}
                              onChange={() => toggleZone(zone)}
                              className="peer sr-only"
                              aria-label={`${zone.zoneName} — ${t("shipping.zones.active")}`}
                            />
                            <div className="h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-600 peer-checked:after:translate-x-5" />
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(zone.id);
                              setDraft({
                                zoneName: zone.zoneName,
                                rate: String(Number(zone.rate)),
                                estimatedDeliveryDays: zone.estimatedDeliveryDays,
                              });
                            }}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            aria-label={t("common.edit")}
                            title={t("common.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteZone(zone)}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            aria-label={t("common.delete")}
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------
           Tab 2 — Orders ready for shipping + bulk action toolbar
           ------------------------------------------------------------------ */
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={orders.length === 0}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {t("shipping.orders.selectAll")}
            </label>

            {selected.length > 0 && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                {t("shipping.orders.selected", { count: selected.length })}
              </span>
            )}

            <div className="ms-auto flex flex-wrap items-center gap-2">
              <select
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                aria-label={t("shipping.orders.courier")}
                className={`${cellSelectClass} py-2`}
              >
                <option value="">{t("shipping.orders.courierNone")}</option>
                {COURIER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handlePrintLabels}
                disabled={busy !== null || orders.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "labels" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                {busy === "labels"
                  ? t("shipping.orders.printing")
                  : t("shipping.orders.printLabels")}
              </button>

              <button
                type="button"
                onClick={handleMarkShipped}
                disabled={busy !== null || orders.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "ship" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="h-4 w-4" />
                )}
                {busy === "ship"
                  ? t("shipping.orders.shipping")
                  : t("shipping.orders.markShipped")}
              </button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-xl bg-white py-16 text-center shadow-sm">
              <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <p className="text-lg font-medium text-slate-600">
                {t("shipping.orders.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t("shipping.orders.emptySubtitle")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label={t("shipping.orders.selectAll")}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-4 text-start">{t("table.customer")}</th>
                      <th className="px-4 py-4 text-start">{t("table.address")}</th>
                      <th className="px-4 py-4 text-start">{t("shipping.orders.zone")}</th>
                      <th className="px-4 py-4 text-start">{t("shipping.orders.cod")}</th>
                      <th className="px-4 py-4 text-start">{t("shipping.orders.tracking")}</th>
                      <th className="px-4 py-4 text-start">{t("table.status")}</th>
                      <th className="px-4 py-4 text-start">{t("table.date")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className={`hover:bg-slate-50 ${
                          selected.includes(order.id) ? "bg-indigo-50/50" : ""
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selected.includes(order.id)}
                            onChange={() => toggleOne(order.id)}
                            aria-label={order.customerName}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-slate-900">
                            {order.customerName}
                          </p>
                          {order.customerPhone && (
                            <p className="mt-0.5 text-xs text-slate-500" dir="ltr">
                              {order.customerPhone}
                            </p>
                          )}
                        </td>
                        <td className="max-w-56 px-4 py-4">
                          <p className="truncate text-sm text-slate-600" title={order.customerAddress}>
                            {order.customerAddress || "—"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {t("shipping.orders.itemsCount", { count: order.itemsCount })}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="relative">
                            <select
                              value={order.shippingZoneId ?? ""}
                              onChange={(e) => assignZone(order.id, e.target.value)}
                              aria-label={t("shipping.orders.zone")}
                              className={cellSelectClass}
                            >
                              <option value="">{t("shipping.orders.zoneUnassigned")}</option>
                              {zones
                                .filter(
                                  (zone) =>
                                    zone.isActive || zone.id === order.shippingZoneId
                                )
                                .map((zone) => (
                                  <option key={zone.id} value={zone.id}>
                                    {zone.zoneName}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-slate-900">
                            {formatMoney(order.totalAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {order.trackingNumber ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-xs font-semibold text-slate-800" dir="ltr">
                                {order.trackingNumber}
                              </span>
                              {order.labelPrintedAt ? (
                                <span className="w-fit rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  {t("shipping.orders.labelPrinted")}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {t("shipping.orders.noTracking")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">
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
      )}

      {labelOrders && (
        <ThermalLabelModal
          orders={labelOrders}
          store={
            store ?? {
              name: t("shipping.orders.fallbackStoreName"),
              slug: "",
              logoUrl: null,
              phone: null,
              address: null,
            }
          }
          onClose={() => setLabelOrders(null)}
          onPrinted={handleLabelsPrinted}
        />
      )}
    </div>
  );
}

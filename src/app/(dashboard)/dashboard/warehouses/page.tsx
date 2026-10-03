"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Boxes,
  Check,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Warehouse,
  X,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  availableQuantity,
  type StockTransferRecord,
  type TransferStatus,
  type WarehouseRecord,
  type WarehouseStockRecord,
} from "@/lib/warehouses";

interface MatrixProduct {
  id: string;
  name: string;
  price: string;
  stock: number;
  imageUrl: string;
  isVisible: boolean;
}

interface WarehouseStats {
  locationCount: number;
  activeCount: number;
  totalUnits: number;
  pendingTransfers: number;
  inTransitTransfers: number;
}

interface WarehouseBundle {
  warehouses: WarehouseRecord[];
  stock: WarehouseStockRecord[];
  products: MatrixProduct[];
  transfers: StockTransferRecord[];
  stats: WarehouseStats;
}

const EMPTY_STATS: WarehouseStats = {
  locationCount: 0,
  activeCount: 0,
  totalUnits: 0,
  pendingTransfers: 0,
  inTransitTransfers: 0,
};

const EMPTY_BUNDLE: WarehouseBundle = {
  warehouses: [],
  stock: [],
  products: [],
  transfers: [],
  stats: EMPTY_STATS,
};

const TABS = [
  { id: "stock", labelKey: "warehouse.tab.stock" },
  { id: "transfers", labelKey: "warehouse.tab.transfers" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TRANSFER_STATUS_LABEL: Record<TransferStatus, TranslationKey> = {
  pending: "warehouse.status.pending",
  in_transit: "warehouse.status.in_transit",
  completed: "warehouse.status.completed",
};

const TRANSFER_STATUS_CLASS: Record<TransferStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_transit: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";
const cellInputClass =
  "w-20 rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function allocationKey(warehouseId: string, productId: string): string {
  return `${warehouseId}:${productId}`;
}

/** Network-only fetch (no state) so effects and handlers can chain it. */
async function fetchWarehouseBundle(): Promise<WarehouseBundle> {
  const res = await fetch("/api/warehouses", { cache: "no-store" });
  if (!res.ok) throw new Error("load failed");
  const payload = (await res.json()) as Partial<WarehouseBundle>;
  return {
    warehouses: payload.warehouses ?? [],
    stock: payload.stock ?? [],
    products: payload.products ?? [],
    transfers: payload.transfers ?? [],
    stats: payload.stats ?? EMPTY_STATS,
  };
}

export default function WarehousesPage() {
  const { t, formatDateTime, formatNumber } = useI18n();

  const [bundle, setBundle] = useState<WarehouseBundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("stock");
  const [toast, setToast] = useState<string | null>(null);

  // Warehouse form
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    useState<WarehouseRecord | null>(null);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formIsMain, setFormIsMain] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  // Stock allocation matrix edits (key -> raw input value)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingStock, setSavingStock] = useState(false);

  // Transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formQuantity, setFormQuantity] = useState("1");
  const [formNotes, setFormNotes] = useState("");
  const [transferBusyId, setTransferBusyId] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      setBundle(await fetchWarehouseBundle());
    } catch {
      showToast(t("warehouse.toast.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    fetchWarehouseBundle()
      .then((payload) => {
        if (!cancelled) setBundle(payload);
      })
      .catch(() => {
        if (!cancelled) showToast(t("warehouse.toast.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const { warehouses, stock, products, transfers, stats } = bundle;

  const stockByKey = useMemo(() => {
    const map = new Map<string, WarehouseStockRecord>();
    for (const row of stock) {
      map.set(allocationKey(row.warehouseId, row.productId), row);
    }
    return map;
  }, [stock]);

  const warehouseById = useMemo(() => {
    const map = new Map<string, WarehouseRecord>();
    for (const row of warehouses) map.set(row.id, row);
    return map;
  }, [warehouses]);

  const productById = useMemo(() => {
    const map = new Map<string, MatrixProduct>();
    for (const row of products) map.set(row.id, row);
    return map;
  }, [products]);

  function quantityFor(warehouseId: string, productId: string): number {
    const key = allocationKey(warehouseId, productId);
    const draft = edits[key];
    if (draft !== undefined) {
      const parsed = Math.floor(Number(draft));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    return stockByKey.get(key)?.quantity ?? 0;
  }

  function cellValue(warehouseId: string, productId: string): string {
    const key = allocationKey(warehouseId, productId);
    if (edits[key] !== undefined) return edits[key];
    return String(stockByKey.get(key)?.quantity ?? 0);
  }

  function productTotal(productId: string): number {
    return warehouses.reduce(
      (sum, warehouse) => sum + quantityFor(warehouse.id, productId),
      0
    );
  }

  function reservedFor(warehouseId: string, productId: string): number {
    return (
      stockByKey.get(allocationKey(warehouseId, productId))
        ?.reservedQuantity ?? 0
    );
  }

  function setCell(warehouseId: string, productId: string, value: string) {
    const clean = value.replace(/[^0-9]/g, "");
    setEdits((current) => ({
      ...current,
      [allocationKey(warehouseId, productId)]: clean,
    }));
  }

  const hasStockEdits = Object.keys(edits).length > 0;

  // ---------------------------------------------
  // Warehouse CRUD
  // ---------------------------------------------
  function openAddWarehouse() {
    setEditingWarehouse(null);
    setFormName("");
    setFormCode("");
    setFormCity("");
    setFormAddress("");
    setFormIsMain(warehouses.length === 0);
    setFormIsActive(true);
    setShowWarehouseForm(true);
  }

  function openEditWarehouse(warehouse: WarehouseRecord) {
    setEditingWarehouse(warehouse);
    setFormName(warehouse.name);
    setFormCode(warehouse.code);
    setFormCity(warehouse.city);
    setFormAddress(warehouse.address);
    setFormIsMain(warehouse.isMainWarehouse);
    setFormIsActive(warehouse.isActive);
    setShowWarehouseForm(true);
  }

  async function handleWarehouseSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formName.trim()) {
      showToast(t("warehouse.error.nameRequired"));
      return;
    }
    if (!formCode.trim()) {
      showToast(t("warehouse.error.codeRequired"));
      return;
    }

    setSavingWarehouse(true);
    try {
      const res = await fetch("/api/warehouses", {
        method: editingWarehouse ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingWarehouse
            ? {
                id: editingWarehouse.id,
                name: formName.trim(),
                code: formCode.trim(),
                city: formCity.trim(),
                address: formAddress.trim(),
                isMainWarehouse: formIsMain,
                isActive: formIsActive,
              }
            : {
                name: formName.trim(),
                code: formCode.trim(),
                city: formCity.trim(),
                address: formAddress.trim(),
                isMainWarehouse: formIsMain,
                isActive: formIsActive,
              }
        ),
      });

      if (!res.ok) throw new Error("save failed");

      setShowWarehouseForm(false);
      showToast(
        editingWarehouse
          ? t("warehouse.toast.updated")
          : t("warehouse.toast.created")
      );
      await load();
    } catch {
      showToast(t("warehouse.toast.saveFailed"));
    } finally {
      setSavingWarehouse(false);
    }
  }

  async function deleteWarehouse(warehouse: WarehouseRecord) {
    if (!window.confirm(t("warehouse.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/warehouses?id=${warehouse.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      showToast(t("warehouse.toast.deleted"));
      await load();
    } catch {
      showToast(t("warehouse.toast.deleteFailed"));
    }
  }

  async function saveAllocation() {
    const entries = Object.entries(edits).map(([key, value]) => {
      const [warehouseId, productId] = key.split(":");
      const existing = stockByKey.get(key);
      return {
        warehouseId,
        productId,
        quantity: Math.max(0, Math.floor(Number(value) || 0)),
        reservedQuantity: existing?.reservedQuantity ?? 0,
      };
    });

    if (entries.length === 0) return;

    setSavingStock(true);
    try {
      const res = await fetch("/api/warehouses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: entries }),
      });
      if (!res.ok) throw new Error("save failed");
      setEdits({});
      showToast(t("warehouse.toast.stockSaved"));
      await load();
    } catch {
      showToast(t("warehouse.toast.stockSaveFailed"));
    } finally {
      setSavingStock(false);
    }
  }

  // ---------------------------------------------
  // Inter-warehouse transfers
  // ---------------------------------------------
  function openTransferForm() {
    const main =
      warehouses.find((warehouse) => warehouse.isMainWarehouse) ??
      warehouses[0];
    setFormFrom(main?.id ?? "");
    setFormTo(warehouses.find((warehouse) => warehouse.id !== main?.id)?.id ?? "");
    setFormProduct(products[0]?.id ?? "");
    setFormQuantity("1");
    setFormNotes("");
    setShowTransferForm(true);
  }

  const fromStock = formFrom && formProduct
    ? stockByKey.get(allocationKey(formFrom, formProduct))
    : undefined;
  const availableAtSource = fromStock ? availableQuantity(fromStock) : 0;

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formFrom || !formTo) {
      showToast(t("warehouse.transfers.selectWarehouse"));
      return;
    }
    if (formFrom === formTo) {
      showToast(t("warehouse.error.sameWarehouse"));
      return;
    }
    if (!formProduct) {
      showToast(t("warehouse.transfers.selectProduct"));
      return;
    }

    setSavingTransfer(true);
    try {
      const res = await fetch("/api/warehouses/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: formFrom,
          toWarehouseId: formTo,
          productId: formProduct,
          quantity: Math.max(1, Math.floor(Number(formQuantity) || 0)),
          notes: formNotes,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.code === "INSUFFICIENT_STOCK") {
          showToast(t("warehouse.transfers.insufficient"));
          return;
        }
        throw new Error("create failed");
      }

      setShowTransferForm(false);
      showToast(t("warehouse.transfers.created"));
      await load();
    } catch {
      showToast(t("warehouse.transfers.failed"));
    } finally {
      setSavingTransfer(false);
    }
  }

  async function advanceTransfer(
    transfer: StockTransferRecord,
    action: "ship" | "receive"
  ) {
    setTransferBusyId(transfer.id);
    try {
      const res = await fetch("/api/warehouses/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transfer.id, action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.code === "INSUFFICIENT_STOCK") {
          showToast(t("warehouse.transfers.insufficient"));
          return;
        }
        throw new Error("transfer failed");
      }
      showToast(
        action === "ship"
          ? t("warehouse.transfers.shipped")
          : t("warehouse.transfers.received")
      );
      await load();
    } catch {
      showToast(t("warehouse.transfers.failed"));
    } finally {
      setTransferBusyId(null);
    }
  }

  const statCards = [
    {
      label: t("warehouse.stats.locations"),
      value: formatNumber(stats.locationCount),
      icon: Warehouse,
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {
      label: t("warehouse.stats.active"),
      value: formatNumber(stats.activeCount),
      icon: MapPin,
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: t("warehouse.stats.units"),
      value: formatNumber(stats.totalUnits),
      icon: Boxes,
      bgColor: "bg-sky-50",
      textColor: "text-sky-600",
    },
    {
      label: t("warehouse.stats.pending"),
      value: formatNumber(stats.pendingTransfers + stats.inTransitTransfers),
      icon: Truck,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
  ];

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <p className="mb-6 text-sm text-slate-500">{t("warehouse.subtitle")}</p>

      {/* Engine summary */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-5 shadow-sm"
              >
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
              </div>
            ))
          : statCards.map((card) => (
              <div key={card.label} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">
                    {card.label}
                  </p>
                  <div className={`rounded-lg ${card.bgColor} p-2`}>
                    <card.icon className={`h-4 w-4 ${card.textColor}`} />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {card.value}
                </p>
              </div>
            ))}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === entry.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t(entry.labelKey)}
            {entry.id === "transfers" &&
              stats.pendingTransfers + stats.inTransitTransfers > 0 && (
                <span className="ms-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold leading-none text-amber-700">
                  {stats.pendingTransfers + stats.inTransitTransfers}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* =========================================== */}
      {/* TAB 1 — Warehouses & Stock Allocation       */}
      {/* =========================================== */}
      {tab === "stock" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("warehouse.matrix.title")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("warehouse.matrix.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddWarehouse}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              {t("warehouse.add")}
            </button>
          </div>

          {/* Locations */}
          {loading ? (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl bg-white p-5 shadow-sm"
                >
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : warehouses.length === 0 ? (
            <div className="mb-6 rounded-xl bg-white px-6 py-12 text-center shadow-sm">
              <Warehouse className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-base font-medium text-slate-600">
                {t("warehouse.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t("warehouse.emptySubtitle")}
              </p>
            </div>
          ) : (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((warehouse) => (
                <div
                  key={warehouse.id}
                  className="rounded-xl bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-slate-900">
                          {warehouse.name}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            warehouse.isMainWarehouse
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {warehouse.isMainWarehouse
                            ? t("warehouse.badge.main")
                            : t("warehouse.badge.branch")}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            warehouse.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {warehouse.isActive
                            ? t("warehouse.badge.active")
                            : t("warehouse.badge.inactive")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500" dir="ltr">
                        {warehouse.code}
                        {warehouse.city ? ` · ${warehouse.city}` : ""}
                      </p>
                      {warehouse.address && (
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {warehouse.address}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openEditWarehouse(warehouse)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t("common.edit")}
                        title={t("common.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteWarehouse(warehouse)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Allocation matrix */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  {t("warehouse.tab.stock")}
                </h4>
                <p className="text-xs text-slate-500">
                  {t("warehouse.matrix.editable")}
                </p>
              </div>
              <button
                type="button"
                onClick={saveAllocation}
                disabled={!hasStockEdits || savingStock}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingStock ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t("warehouse.saveAllocation")}
              </button>
            </div>

            {warehouses.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                {t("warehouse.matrix.noLocations")}
              </p>
            ) : products.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">
                {t("warehouse.matrix.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-start text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.matrix.product")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("warehouse.matrix.catalog")}
                      </th>
                      {warehouses.map((warehouse) => (
                        <th
                          key={warehouse.id}
                          className="px-4 py-3 text-center"
                          title={warehouse.city || warehouse.name}
                        >
                          <span className="block truncate font-semibold text-slate-600">
                            {warehouse.name}
                          </span>
                          <span className="block text-[10px] font-normal text-slate-400">
                            {warehouse.code}
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center">
                        {t("warehouse.matrix.total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const total = productTotal(product.id);
                      return (
                        <tr
                          key={product.id}
                          className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                                <Package className="h-4 w-4 text-slate-400" />
                              </span>
                              <span className="truncate font-medium text-slate-700">
                                {product.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                            {product.stock}
                          </td>
                          {warehouses.map((warehouse) => {
                            const reserved = reservedFor(
                              warehouse.id,
                              product.id
                            );
                            return (
                              <td
                                key={warehouse.id}
                                className="px-4 py-3 text-center"
                              >
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cellValue(warehouse.id, product.id)}
                                  onChange={(event) =>
                                    setCell(
                                      warehouse.id,
                                      product.id,
                                      event.target.value
                                    )
                                  }
                                  aria-label={`${warehouse.name} · ${product.name}`}
                                  className={`${cellInputClass} mx-auto ${
                                    reserved > 0 ? "border-amber-300" : ""
                                  }`}
                                />
                                {reserved > 0 && (
                                  <span className="mt-1 block text-[10px] font-medium text-amber-600">
                                    {t("warehouse.matrix.reserved", {
                                      count: reserved,
                                    })}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-900">
                            {total}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================== */}
      {/* TAB 2 — Inter-Warehouse Stock Transfers    */}
      {/* =========================================== */}
      {tab === "transfers" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("warehouse.transfers.title")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("warehouse.transfers.subtitle")}
              </p>
            </div>
            <button
              type="button"
              onClick={openTransferForm}
              disabled={warehouses.length < 2 || products.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight className="h-4 w-4" />
              {t("warehouse.transfers.new")}
            </button>
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            {loading ? (
              <div className="p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="mb-4 h-10 animate-pulse rounded bg-slate-200"
                  />
                ))}
              </div>
            ) : transfers.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Truck className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-medium text-slate-600">
                  {t("warehouse.transfers.emptyTitle")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t("warehouse.transfers.emptySubtitle")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.transfers.product")}
                      </th>
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.transfers.from")}
                      </th>
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.transfers.to")}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {t("warehouse.transfers.quantity")}
                      </th>
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.transfers.status")}
                      </th>
                      <th className="px-4 py-3 text-start">
                        {t("warehouse.transfers.date")}
                      </th>
                      <th className="px-4 py-3 text-end">
                        {t("warehouse.transfers.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((transfer) => {
                      const busy = transferBusyId === transfer.id;
                      return (
                        <tr
                          key={transfer.id}
                          className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-700">
                              {productById.get(transfer.productId)?.name ??
                                t("warehouse.transfers.selectProduct")}
                            </p>
                            {transfer.notes && (
                              <p className="mt-0.5 truncate text-xs text-slate-400">
                                {transfer.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {warehouseById.get(transfer.fromWarehouseId)
                              ?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {warehouseById.get(transfer.toWarehouseId)?.name ??
                              "—"}
                          </td>
                          <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-900">
                            {transfer.quantity}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                TRANSFER_STATUS_CLASS[transfer.status]
                              }`}
                            >
                              {t(TRANSFER_STATUS_LABEL[transfer.status])}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatDateTime(transfer.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {transfer.status === "pending" && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    advanceTransfer(transfer, "ship")
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Truck className="h-3.5 w-3.5" />
                                  )}
                                  {t("warehouse.transfers.approveShip")}
                                </button>
                              )}
                              {transfer.status === "in_transit" && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    advanceTransfer(transfer, "receive")
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  {t("warehouse.transfers.confirmReceipt")}
                                </button>
                              )}
                              {transfer.status === "completed" && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                                  <Check className="h-3.5 w-3.5" />
                                  {t("warehouse.status.completed")}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warehouse form modal */}
      {showWarehouseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingWarehouse
                  ? t("warehouse.editTitle")
                  : t("warehouse.addTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowWarehouseForm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleWarehouseSubmit} className="space-y-3">
              <div>
                <label className={labelClass}>{t("warehouse.field.name")}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  required
                  className={inputClass}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {t("warehouse.field.code")}
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(event) =>
                      setFormCode(event.target.value.toUpperCase())
                    }
                    placeholder={t("warehouse.codePlaceholder")}
                    dir="ltr"
                    required
                    className={`${inputClass} font-mono uppercase`}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {t("warehouse.field.city")}
                  </label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(event) => setFormCity(event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <p className="-mt-1 text-xs text-slate-400">
                {t("warehouse.field.cityHint")}
              </p>

              <div>
                <label className={labelClass}>
                  {t("warehouse.field.address")}
                </label>
                <textarea
                  value={formAddress}
                  onChange={(event) => setFormAddress(event.target.value)}
                  rows={2}
                  dir="auto"
                  className={inputClass}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formIsMain}
                  onChange={(event) => setFormIsMain(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">
                  {t("warehouse.field.main")}
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(event) => setFormIsActive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">
                  {t("warehouse.field.active")}
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWarehouseForm(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingWarehouse}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingWarehouse && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingWarehouse ? t("common.update") : t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer form modal */}
      {showTransferForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {t("warehouse.transfers.formTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowTransferForm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-3">
              <div>
                <label className={labelClass}>
                  {t("warehouse.transfers.from")}
                </label>
                <select
                  value={formFrom}
                  onChange={(event) => {
                    const next = event.target.value;
                    setFormFrom(next);
                    if (next === formTo) {
                      setFormTo(
                        warehouses.find(
                          (warehouse) => warehouse.id !== next
                        )?.id ?? ""
                      );
                    }
                  }}
                  className={inputClass}
                >
                  <option value="">
                    {t("warehouse.transfers.selectWarehouse")}
                  </option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("warehouse.transfers.to")}
                </label>
                <select
                  value={formTo}
                  onChange={(event) => setFormTo(event.target.value)}
                  className={inputClass}
                >
                  <option value="">
                    {t("warehouse.transfers.selectWarehouse")}
                  </option>
                  {warehouses
                    .filter((warehouse) => warehouse.id !== formFrom)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  {t("warehouse.transfers.product")}
                </label>
                <select
                  value={formProduct}
                  onChange={(event) => setFormProduct(event.target.value)}
                  className={inputClass}
                >
                  <option value="">
                    {t("warehouse.transfers.selectProduct")}
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {t("warehouse.transfers.available", {
                    count: availableAtSource,
                  })}
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  {t("warehouse.transfers.quantity")}
                </label>
                <input
                  type="number"
                  min={1}
                  value={formQuantity}
                  onChange={(event) => setFormQuantity(event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  {t("warehouse.transfers.notes")}
                </label>
                <textarea
                  value={formNotes}
                  onChange={(event) => setFormNotes(event.target.value)}
                  rows={2}
                  dir="auto"
                  placeholder={t("warehouse.transfers.notesPlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferForm(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingTransfer ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowLeftRight className="h-4 w-4" />
                  )}
                  {t("warehouse.transfers.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

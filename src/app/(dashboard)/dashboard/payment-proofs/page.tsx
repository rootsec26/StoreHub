"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Check,
  X,
  Loader2,
  RefreshCw,
  Receipt,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  Banknote,
  ImageOff,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import StatusBadge from "@/components/StatusBadge";

interface ProofOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  totalAmount: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  paymentProofUrl: string;
  paymentProofStatus: string;
  paymentProofSubmittedAt: string | null;
  paymentMethodDetail: string;
  createdAt: string;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  unitPrice: string;
  product?: { name: string; imageUrl?: string | null } | null;
}

const PROOF_STATUS_ORDER = ["PENDING", "NONE", "APPROVED", "REJECTED"];

export default function PaymentProofsPage() {
  const { t, formatMoney, formatDateTime } = useI18n();

  const [orders, setOrders] = useState<ProofOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
  const [itemsLoadingId, setItemsLoadingId] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      const all: ProofOrder[] = data.orders || [];
      const proofs = all.filter(
        (o) =>
          o.paymentMethod === "manual" ||
          (o.paymentProofStatus && o.paymentProofStatus !== "NONE") ||
          o.paymentProofUrl
      );
      proofs.sort((a, b) => {
        const rank = (s: string) => PROOF_STATUS_ORDER.indexOf(s);
        const diff = rank(a.paymentProofStatus) - rank(b.paymentProofStatus);
        if (diff !== 0) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      });
      setOrders(proofs);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function toggleItems(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (itemsByOrder[orderId]) return;
    setItemsLoadingId(orderId);
    try {
      const res = await fetch(`/api/orders?id=${orderId}`);
      const data = await res.json();
      setItemsByOrder((prev) => ({
        ...prev,
        [orderId]: data.items || [],
      }));
    } catch {
      setItemsByOrder((prev) => ({ ...prev, [orderId]: [] }));
    } finally {
      setItemsLoadingId(null);
    }
  }

  async function reviewProof(orderId: string, action: "approve" | "reject") {
    setReviewingId(orderId);
    try {
      const res = await fetch("/api/orders/payment-proof/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      if (!res.ok) throw new Error("review failed");
      showToast(
        action === "approve"
          ? t("orders.proofs.toastApproved")
          : t("orders.proofs.toastRejected")
      );
      setExpandedId(null);
      loadData();
    } catch {
      showToast(t("orders.proofs.toastFailed"));
    } finally {
      setReviewingId(null);
    }
  }

  function proofBadge(status: string) {
    const key =
      status === "PENDING"
        ? "orders.proofs.statusPending"
        : status === "APPROVED"
          ? "orders.proofs.statusApproved"
          : status === "REJECTED"
            ? "orders.proofs.statusRejected"
            : "orders.proofs.statusNone";
    const cls =
      status === "PENDING"
        ? "bg-amber-100 text-amber-700"
        : status === "APPROVED"
          ? "bg-emerald-100 text-emerald-700"
          : status === "REJECTED"
            ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-600";
    return (
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
        {t(key as TranslationKey)}
      </span>
    );
  }

  const pendingCount = orders.filter((o) => o.paymentProofStatus === "PENDING").length;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed end-4 top-4 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("proofs.title")}
          </h1>
          <p className="text-sm text-slate-500">{t("proofs.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadData();
          }}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </button>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {t("proofs.pendingBanner").replace("{count}", String(pendingCount))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <Receipt className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("orders.proofs.empty")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => {
            const expanded = expandedId === order.id;
            const items = itemsByOrder[order.id];
            return (
              <div
                key={order.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* ── Header: customer + order reference + statuses ── */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
                      {order.customerName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {order.customerName}
                      </p>
                      <p className="truncate text-xs text-slate-500" dir="ltr">
                        {order.customerPhone || "—"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-400" dir="ltr">
                        #{order.id.slice(0, 8).toUpperCase()}
                        {order.paymentProofSubmittedAt &&
                          ` · ${formatDateTime(order.paymentProofSubmittedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={order.status} />
                    {proofBadge(order.paymentProofStatus)}
                  </div>
                </div>

                {/* ── Proof screenshot ── */}
                <div className="p-4 pb-0">
                  {order.paymentProofUrl ? (
                    <button
                      type="button"
                      onClick={() => setZoomUrl(order.paymentProofUrl)}
                      className="group relative block h-44 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.paymentProofUrl}
                        alt={t("orders.proofs.viewProof")}
                        className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute bottom-2 end-2 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-[11px] font-semibold text-white opacity-90 shadow transition group-hover:opacity-100">
                        <ZoomIn className="h-3.5 w-3.5" />
                        {t("proofs.zoomHint")}
                      </span>
                    </button>
                  ) : (
                    <div className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 text-slate-400">
                      <ImageOff className="h-6 w-6" />
                      <span className="text-xs font-medium">
                        {t("orders.proofs.statusNone")}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Amount + payment method ── */}
                <div className="flex items-center justify-between gap-3 px-4 pt-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("store.total")}
                    </p>
                    <p className="text-lg font-bold text-slate-900" dir="ltr">
                      {formatMoney(Number(order.totalAmount))}
                    </p>
                  </div>
                  {order.paymentMethodDetail ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <Banknote className="h-3.5 w-3.5" />
                      {order.paymentMethodDetail}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                      <Banknote className="h-3.5 w-3.5" />
                      {t("orders.proofs.method")}
                    </span>
                  )}
                </div>

                {/* ── Expandable order items (accordion) ── */}
                <div className="px-4 pt-3">
                  <button
                    type="button"
                    onClick={() => toggleItems(order.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-1.5">
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {t("proofs.orderItems")}
                    </span>
                    {items && items.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        {items.length}
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3">
                      {itemsLoadingId === order.id ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                        </div>
                      ) : !items || items.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          {t("proofs.noItems")}
                        </p>
                      ) : (
                        items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 text-xs text-slate-700"
                          >
                            <span className="truncate">
                              {item.product?.name || t("proofs.unknownProduct")}{" "}
                              × {item.quantity}
                            </span>
                            <span className="shrink-0 font-medium" dir="ltr">
                              {formatMoney(
                                Number(item.unitPrice) * item.quantity
                              )}
                            </span>
                          </div>
                        ))
                      )}
                      {order.notes && (
                        <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                          {t("orders.notes")}: {order.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Actions footer ── */}
                <div className="mt-auto border-t border-slate-100 p-4 pt-3">
                  {order.paymentProofStatus === "PENDING" ? (
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => reviewProof(order.id, "approve")}
                        disabled={reviewingId === order.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {reviewingId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {t("orders.proofs.approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewProof(order.id, "reject")}
                        disabled={reviewingId === order.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        {t("orders.proofs.reject")}
                      </button>
                    </div>
                  ) : (
                    <p className="py-1 text-center text-xs text-slate-400">
                      {order.paymentProofStatus === "APPROVED"
                        ? t("orders.proofs.statusApproved")
                        : order.paymentProofStatus === "REJECTED"
                          ? t("orders.proofs.statusRejected")
                          : "—"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zoom lightbox */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setZoomUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt={t("orders.proofs.viewProof")}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Package, Printer, ShieldCheck, X } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useStoreCurrency } from "@/components/CurrencySelector";
import { canOptimizeImage } from "@/lib/images";
import type { StorefrontStore, TrackedOrder } from "@/lib/order-tracking";

const KNOWN_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Shipped",
  "Completed",
  "Cancelled",
];

interface OrderInvoiceModalProps {
  order: TrackedOrder;
  store: StorefrontStore;
  onClose: () => void;
}

export default function OrderInvoiceModal({ order, store, onClose }: OrderInvoiceModalProps) {
  const { t, locale } = useI18n();
  const { formattedPrice } = useStoreCurrency(
    store.currency || "EGP",
    store.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"],
    locale
  );

  const [container] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.body
  );
  const [verifyUrl] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/store/${store.slug}/track-order?id=${encodeURIComponent(order.id)}`
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const subtotal = order.items.reduce(
    (sum, item) => sum + parseFloat(item.unitPrice) * item.quantity,
    0
  );
  const total = parseFloat(order.totalAmount) || subtotal;
  const shipping = 0;
  const tax = 0;

  const statusLabel = KNOWN_STATUSES.includes(order.status)
    ? t(`orders.status.${order.status}` as TranslationKey)
    : order.status;

  const createdDate = new Date(order.createdAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const createdTime = new Date(order.createdAt).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  function handlePrint() {
    window.print();
  }

  if (!container) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 print:static print:overflow-visible print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label={t("orders.invoice.title")}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-[794px] bg-white shadow-2xl print:my-0 print:max-w-none print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 print:hidden">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Printer className="h-4 w-4 text-[var(--color-primary)]" />
            {t("orders.invoice.title")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              <Printer className="h-4 w-4" />
              {t("orders.invoice.print")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              {t("common.close")}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-8 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                {store.logoUrl ? (
                  <Image
                    src={store.logoUrl}
                    alt={store.name}
                    width={56}
                    height={56}
                    unoptimized={!canOptimizeImage(store.logoUrl)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package className="h-7 w-7 text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">{store.name}</h2>
                {store.address && <p className="text-xs text-slate-500">{store.address}</p>}
                {store.phone && (
                  <p className="text-xs text-slate-500" dir="ltr">
                    {store.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="text-end">
              <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
                {t("orders.invoice.title")}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {t("orders.invoice.invoiceNo")}:{" "}
                <span className="font-mono text-slate-800" dir="ltr">
                  {order.id}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {t("orders.invoice.date")}: {createdDate} · {createdTime}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("orders.invoice.billTo")}
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-900">{order.customerName}</p>
              {order.customerPhone && (
                <p className="text-sm text-slate-600" dir="ltr">
                  {order.customerPhone}
                </p>
              )}
              {order.customerAddress && (
                <p className="text-sm text-slate-600">{order.customerAddress}</p>
              )}
            </div>
            <div className="sm:text-end">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("orders.timeline.title")}
              </h3>
              <p className="mt-1 text-sm font-medium text-[var(--color-primary)]">{statusLabel}</p>
              <p className="text-sm text-slate-600">
                {t("orders.itemsCount")}: {order.items.length}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 text-start font-semibold">#</th>
                  <th className="py-2 text-start font-semibold">{t("orders.invoice.item")}</th>
                  <th className="py-2 text-center font-semibold">{t("orders.invoice.qty")}</th>
                  <th className="py-2 text-end font-semibold">
                    {t("orders.invoice.unitPrice")}
                  </th>
                  <th className="py-2 text-end font-semibold">{t("orders.invoice.total")}</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-100 align-middle">
                    <td className="py-2.5 text-slate-400">{index + 1}</td>
                    <td className="py-2.5 pe-2">
                      <div className="flex items-center gap-2">
                        <div className="hidden h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100 sm:block">
                          {item.product?.imageUrl ? (
                            <Image
                              src={item.product.imageUrl}
                              alt={item.product.name}
                              width={36}
                              height={36}
                              unoptimized={!canOptimizeImage(item.product.imageUrl)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Package className="h-4 w-4 text-slate-300" />
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-slate-800">
                          {item.product?.name || t("orders.productRemoved")}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                    <td className="py-2.5 text-end text-slate-600">
                      {formattedPrice(parseFloat(item.unitPrice))}
                    </td>
                    <td className="py-2.5 text-end font-medium text-slate-900">
                      {formattedPrice(parseFloat(item.unitPrice) * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 rounded-lg border border-dashed border-slate-300 p-4 text-center">
              {verifyUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <QRCodeSVG
                    value={verifyUrl}
                    size={112}
                    level="M"
                    marginSize={1}
                    title={t("orders.invoice.scanToVerify")}
                  />
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    {t("orders.invoice.scanToVerify")}
                  </p>
                  <p className="break-all text-[10px] text-slate-400" dir="ltr">
                    {verifyUrl}
                  </p>
                </div>
              ) : (
                <div className="h-[168px]" />
              )}
            </div>

            <dl className="w-full text-sm sm:max-w-[260px]">
              <div className="flex items-center justify-between py-1">
                <dt className="text-slate-500">{t("orders.invoice.subtotal")}</dt>
                <dd className="text-slate-800">{formattedPrice(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between py-1">
                <dt className="text-slate-500">{t("orders.invoice.shipping")}</dt>
                <dd className="text-slate-800">
                  {shipping > 0 ? formattedPrice(shipping) : t("orders.invoice.free")}
                </dd>
              </div>
              <div className="flex items-center justify-between py-1">
                <dt className="text-slate-500">{t("orders.invoice.tax")}</dt>
                <dd className="text-slate-800">
                  {tax > 0 ? formattedPrice(tax) : t("orders.invoice.included")}
                </dd>
              </div>
              <div className="mt-2 flex items-center justify-between border-t-2 border-slate-800 pt-2">
                <dt className="text-base font-bold text-slate-900">
                  {t("orders.invoice.total")}
                </dt>
                <dd className="text-base font-black text-[var(--color-primary)]">
                  {formattedPrice(total)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 text-center">
            <p className="text-sm font-medium text-slate-700">{t("orders.invoice.thankYou")}</p>
            <p className="mt-1 text-xs text-slate-400">{store.name}</p>
          </div>
        </div>
      </div>
    </div>,
    container
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage } from "@/lib/images";
import { storePath } from "@/lib/site";
import StoreFooter from "@/components/storefront/Footer";
import { useStoreCurrency } from "@/components/CurrencySelector";
import { buildWhatsAppOrderUrl } from "@/lib/whatsapp";
import {
  TRACKING_PROGRESS_STEPS,
  type ShipmentSummary,
  type TrackingProgressStep,
} from "@/lib/shipping";

export interface TrackingStoreData {
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  accentColor: string | null;
  currency: string;
  supportedCurrencies: string[];
  hasWhiteLabel: boolean;
}

export interface TrackingItemData {
  id: string;
  name: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: string;
}

export interface TrackingOrderData {
  id: string;
  status: string;
  createdAt: string;
  totalAmount: string;
  customerName: string;
  customerAddress: string | null;
  shipping: ShipmentSummary;
  items: TrackingItemData[];
}

const STEP_ICONS: Record<TrackingProgressStep, typeof Clock> = {
  placed: Clock,
  preparing: Package,
  shipped: Truck,
  out_for_delivery: MapPin,
  delivered: CheckCircle2,
};

const STEP_LABEL_KEYS: Record<TrackingProgressStep, TranslationKey> = {
  placed: "track.step.placed",
  preparing: "track.step.preparing",
  shipped: "track.step.shipped",
  out_for_delivery: "track.step.outForDelivery",
  delivered: "track.step.delivered",
};

interface TrackingPortalProps {
  store: TrackingStoreData;
  order: TrackingOrderData;
}

/**
 * Public, branded live-tracking portal rendered at
 * `/store/[slug]/track/[orderId]`. Polls the tracking API so the timeline
 * moves on its own whenever the carrier reports a new scan.
 */
export default function TrackingPortal({ store, order }: TrackingPortalProps) {
  const { t, locale, formatDate, formatDateTime } = useI18n();

  const [shipping, setShipping] = useState<ShipmentSummary>(order.shipping);
  const [orderStatus, setOrderStatus] = useState(order.status);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const accent = normalizeAccent(store.accentColor);
  const { formattedPrice } = useStoreCurrency(
    store.currency,
    store.supportedCurrencies.length > 0 ? store.supportedCurrencies : [store.currency],
    locale
  );

  const currentIndex = shipping.progressIndex;
  const isCancelled = orderStatus === "Cancelled";
  const isComplete = orderStatus === "Completed" || shipping.status === "DELIVERED";
  const shortId = order.id.slice(0, 8).toUpperCase();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/storefront/orders/track?slug=${encodeURIComponent(store.slug)}&id=${encodeURIComponent(order.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.shipping) setShipping(data.shipping as ShipmentSummary);
      if (typeof data?.order?.status === "string") setOrderStatus(data.order.status);
    } catch {
      // Transient network failure — the next interval retries.
    } finally {
      setRefreshing(false);
    }
  }, [order.id, store.slug]);

  useEffect(() => {
    if (isComplete || isCancelled) return;
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [isComplete, isCancelled, refresh]);

  async function handleCopy() {
    if (!shipping.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(shipping.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const supportUrl = buildWhatsAppOrderUrl(
    store.phone,
    t("track.supportMessage", { store: store.name, id: shortId })
  );

  const progressFraction =
    currentIndex <= 0
      ? 0
      : currentIndex / (TRACKING_PROGRESS_STEPS.length - 1);

  const statusBadge = (() => {
    const map: Record<string, { label: string; className: string }> = {
      Pending: { label: t("orders.status.pending"), className: "bg-amber-100 text-amber-800" },
      Confirmed: { label: t("orders.status.confirmed"), className: "bg-blue-100 text-blue-800" },
      Preparing: { label: t("orders.status.preparing"), className: "bg-purple-100 text-purple-800" },
      Ready: { label: t("orders.status.ready"), className: "bg-indigo-100 text-indigo-800" },
      Shipped: { label: t("orders.status.shipped"), className: "bg-cyan-100 text-cyan-800" },
      Completed: { label: t("orders.status.completed"), className: "bg-emerald-100 text-emerald-800" },
      Cancelled: { label: t("orders.status.cancelled"), className: "bg-red-100 text-red-800" },
    };
    const entry = map[orderStatus] || {
      label: orderStatus,
      className: "bg-slate-100 text-slate-800",
    };
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${entry.className}`}
      >
        {orderStatus === "Cancelled" ? (
          <XCircle className="h-4 w-4" />
        ) : orderStatus === "Completed" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
        )}
        {entry.label}
      </span>
    );
  })();

  return (
    <div style={accentThemeStyle(accent)} className="min-h-screen bg-slate-50">
      <header className="relative overflow-hidden" style={{ backgroundImage: accentGradient(accent) }}>
        <div className="relative mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={storePath(store.slug)}
            className="text-white/80 hover:text-white"
            aria-label={t("track.backToStore")}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-white">{t("track.title")}</h1>
            <p className="mt-0.5 text-xs text-white/75">{t("track.subtitle")}</p>
          </div>
          <span className="w-5" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        {/* Store identity */}
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          {store.logoUrl ? (
            <Image
              src={store.logoUrl}
              alt={store.name}
              width={44}
              height={44}
              unoptimized={!canOptimizeImage(store.logoUrl)}
              className="h-11 w-11 rounded-lg object-cover"
            />
          ) : (
            <span
              className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {store.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{store.name}</p>
            <p className="text-xs text-slate-500">{t("track.orderReference", { id: shortId })}</p>
          </div>
          {statusBadge}
        </div>

        {isCancelled && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("track.cancelledNotice")}</span>
          </div>
        )}

        {/* Live progress */}
        <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-slate-500">
                {isComplete && !isCancelled
                  ? t("track.deliveredOn")
                  : t("track.estimatedDelivery")}
              </h2>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {shipping.estimatedDeliveryAt
                  ? formatDate(shipping.estimatedDeliveryAt)
                  : t("track.etaUnavailable")}
              </p>
              <p className="text-xs text-slate-400">
                {t("track.orderPlacedOn", { date: formatDateTime(order.createdAt) })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {t("track.refresh")}
            </button>
          </div>

          <div className="relative">
            <span className="absolute start-4 end-4 top-[15px] h-0.5 rounded-full bg-slate-200" />
            <span
              className="absolute start-4 top-[15px] h-0.5 rounded-full transition-all duration-500"
              style={{
                width: `calc((100% - 32px) * ${progressFraction})`,
                backgroundColor: accent,
              }}
            />
            <ol className="relative flex items-start justify-between">
              {TRACKING_PROGRESS_STEPS.map((step, index) => {
                const StepIcon = STEP_ICONS[step];
                const done = index < currentIndex;
                const active = index === currentIndex;
                return (
                  <li
                    key={step}
                    className="flex w-1/5 flex-col items-center gap-2 text-center"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                        done || active
                          ? "border-transparent text-white"
                          : "border-slate-200 bg-white text-slate-300"
                      }`}
                      style={done || active ? { backgroundColor: accent } : undefined}
                      aria-current={active ? "step" : undefined}
                    >
                      {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                    </span>
                    <span
                      className={`text-[10px] leading-tight sm:text-xs ${
                        done || active ? "font-semibold text-slate-800" : "text-slate-400"
                      }`}
                    >
                      {t(STEP_LABEL_KEYS[step])}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            {isComplete || isCancelled ? t("track.upToDate") : t("track.autoRefresh")}
          </p>
        </section>

        {/* Shipment details */}
        <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("track.carrier")}
              </p>
              <p className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
                <Truck className="h-4 w-4" style={{ color: accent }} />
                {shipping.carrierLabel || t("track.carrierPending")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("track.trackingNumber")}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="truncate font-semibold text-slate-900" dir="ltr">
                  {shipping.trackingNumber || t("track.noTracking")}
                </code>
                {shipping.trackingNumber && (
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                    aria-label={t("track.copy")}
                    title={t("track.copy")}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <dt className="sr-only">{t("track.shipTo")}</dt>
                <dd className="text-slate-700">
                  {order.customerName}
                  {order.customerAddress ? ` — ${order.customerAddress}` : ""}
                </dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Order summary */}
        <section className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-sm font-medium text-slate-700">{t("track.summary")}</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name || ""}
                      width={40}
                      height={40}
                      unoptimized={!canOptimizeImage(item.imageUrl)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShoppingBag className="h-5 w-5 text-slate-300" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {item.name || t("track.itemFallback")}
                </span>
                <span className="text-xs text-slate-500">×{item.quantity}</span>
                <span className="text-sm font-semibold text-slate-900">
                  {formattedPrice(parseFloat(item.unitPrice) * item.quantity)}
                </span>
              </li>
            ))}
            {order.items.length === 0 && (
              <li className="text-sm text-slate-400">{t("track.noItems")}</li>
            )}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">{t("store.total")}</span>
            <span className="text-lg font-bold" style={{ color: accent }}>
              {formattedPrice(parseFloat(order.totalAmount))}
            </span>
          </div>
        </section>

        {/* Support */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {supportUrl && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
              </svg>
              {t("track.support")}
            </a>
          )}
          <Link
            href={storePath(store.slug)}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("track.backToStore")}
          </Link>
        </div>
      </main>

      <StoreFooter
        hasWhiteLabel={store.hasWhiteLabel}
        containerClassName="mx-auto max-w-3xl px-4 text-center"
        icon={<Truck className="h-4 w-4" style={{ color: accent }} />}
      />
    </div>
  );
}

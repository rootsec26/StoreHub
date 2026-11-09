"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Loader2,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCw,
  Search,
  SearchX,
  Truck,
  User,
  Wallet,
  XCircle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage } from "@/lib/images";
import { storePath } from "@/lib/site";
import { useStoreCurrency } from "@/components/CurrencySelector";
import StoreFooter from "@/components/storefront/Footer";
import OrderStatusTimeline from "@/components/storefront/OrderStatusTimeline";
import OrderInvoiceModal from "@/components/storefront/OrderInvoiceModal";
import {
  isFinalOrderStatus,
  isValidOrderId,
  isValidPhoneNumber,
  isValidTrackingCode,
  orderTrackingCode,
  type StorefrontStore,
  type TrackedOrder,
} from "@/lib/order-tracking";
import { normalizeOrderStatus } from "@/lib/order-state-machine";

type SearchType = "orderId" | "phone";

function TrackOrderContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  const { t, locale } = useI18n();

  const prefillId = searchParams.get("id") || searchParams.get("order_id") || "";
  const accessToken = searchParams.get("token") || searchParams.get("order_token") || "";

  const [store, setStore] = useState<StorefrontStore | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [searchQuery, setSearchQuery] = useState(prefillId);
  const [searchType, setSearchType] = useState<SearchType>("orderId");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const prefillApplied = useRef(false);

  const { formattedPrice } = useStoreCurrency(
    store?.currency || "EGP",
    store?.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"],
    locale
  );

  useEffect(() => {
    let cancelled = false;
    async function loadStore() {
      try {
        const res = await fetch(`/api/products?slug=${encodeURIComponent(slug)}&visible=true`);
        const data = await res.json();
        if (cancelled || !data.store) return;
        setStore({
          id: data.store.id,
          name: data.store.name,
          slug: data.store.slug,
          logoUrl: data.store.logoUrl || "",
          phone: data.store.phone || "",
          address: data.store.address || "",
          accentColor: data.store.accentColor || "",
          currency: data.store.currency || "EGP",
          supportedCurrencies: data.store.supportedCurrencies || [
            "EGP",
            "USD",
            "SAR",
            "AED",
            "EUR",
          ],
          hasWhiteLabel: data.store.hasWhiteLabel === true,
        });
      } catch {
        if (!cancelled) setStore(null);
      }
    }
    loadStore();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const lookupOrder = useCallback(
    async (rawQuery: string, type: SearchType, silent = false): Promise<string | null> => {
      const query = rawQuery.trim();

      if (!query) return t("orders.enterOrderIdOrPhone");
      if (
        type === "orderId" &&
        !isValidOrderId(query) &&
        !isValidTrackingCode(query)
      )
        return t("orders.invalidOrderId");
      if (type === "phone" && !isValidPhoneNumber(query)) return t("orders.invalidPhone");

      try {
        const param = type === "orderId" ? "id" : "phone";
        const tokenQuery = accessToken
          ? `&token=${encodeURIComponent(accessToken)}`
          : "";
        const res = await fetch(
          `/api/storefront/orders/track?slug=${encodeURIComponent(slug)}&${param}=${encodeURIComponent(query)}${tokenQuery}`
        );
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 404) {
            if (!silent) {
              setOrder(null);
              setNotFound(true);
            }
            return null;
          }
          return data.error || t("orders.searchFailed");
        }

        setOrder(data.order as TrackedOrder);
        setNotFound(false);
        return null;
      } catch {
        if (!silent) setOrder(null);
        return t("orders.searchFailed");
      }
    },
    [slug, t, accessToken]
  );

  useEffect(() => {
    if (
      !prefillId ||
      prefillApplied.current ||
      (!isValidOrderId(prefillId) && !isValidTrackingCode(prefillId))
    )
      return;
    prefillApplied.current = true;
    void lookupOrder(prefillId, "orderId");
  }, [prefillId, lookupOrder]);

  useEffect(() => {
    if (!order || isFinalOrderStatus(order.status)) return;

    // Live-ish sync: poll while the tab is visible, plus an immediate refetch
    // whenever the shopper returns to the tab after the merchant updated it.
    const poll = () => {
      if (document.visibilityState === "visible") {
        void lookupOrder(order.id, "orderId", true);
      }
    };
    const timer = setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [order, lookupOrder]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotFound(false);
    setLoading(true);
    lookupOrder(searchQuery, searchType)
      .then((message) => {
        if (message) setError(message);
      })
      .finally(() => setLoading(false));
  }

  async function handleRefresh() {
    if (!order) return;
    setRefreshing(true);
    try {
      await lookupOrder(order.id, "orderId", true);
    } finally {
      setRefreshing(false);
    }
  }

  function handleSearchAgain() {
    setNotFound(false);
    setError("");
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusBadge(status: string) {
    const statuses: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
      PENDING: {
        label: t("orders.status.pending"),
        icon: <Clock className="h-4 w-4" />,
        color: "bg-amber-100 text-amber-800",
      },
      CONFIRMED: {
        label: t("orders.status.confirmed"),
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: "bg-blue-100 text-blue-800",
      },
      PROCESSING: {
        label: t("orders.status.processing"),
        icon: <Package className="h-4 w-4" />,
        color: "bg-purple-100 text-purple-800",
      },
      READY: {
        label: t("orders.status.ready"),
        icon: <Truck className="h-4 w-4" />,
        color: "bg-indigo-100 text-indigo-800",
      },
      SHIPPED: {
        label: t("orders.status.shipped"),
        icon: <Truck className="h-4 w-4" />,
        color: "bg-cyan-100 text-cyan-800",
      },
      DELIVERED: {
        label: t("orders.status.delivered"),
        icon: <CheckCircle2 className="h-4 w-4 fill-current" />,
        color: "bg-emerald-100 text-emerald-800",
      },
      CANCELLED: {
        label: t("orders.status.cancelled"),
        icon: <XCircle className="h-4 w-4" />,
        color: "bg-red-100 text-red-800",
      },
    };

    const canonical = normalizeOrderStatus(status);
    const s = (canonical ? statuses[canonical] : undefined) || {
      label: status,
      icon: <AlertCircle className="h-4 w-4" />,
      color: "bg-slate-100 text-slate-800",
    };
    const pulsing = !isFinalOrderStatus(status);

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${s.color}`}
      >
        {pulsing && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
        )}
        {s.icon}
        {s.label}
      </span>
    );
  }

  const accent = store ? normalizeAccent(store.accentColor) : "";

  return (
    <div
      style={accentThemeStyle(accent)}
      className={`min-h-screen bg-slate-50 ${invoiceOpen ? "print:hidden" : ""}`}
    >
      <header className="relative overflow-hidden" style={{ backgroundImage: accentGradient(accent) }}>
        <div className="relative mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={storePath(slug)}
            className="text-white/80 hover:text-white"
            aria-label={t("orders.backToStore")}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-white">{t("orders.title")}</h1>
            <p className="mt-0.5 text-xs text-white/75">{t("orders.subtitle")}</p>
          </div>
          <span className="w-5" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {t("orders.searchTitle")}
          </h2>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("orders.searchBy")}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSearchType("orderId")}
                  className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                    searchType === "orderId"
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t("orders.searchByOrderId")}
                </button>
                <button
                  type="button"
                  onClick={() => setSearchType("phone")}
                  className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                    searchType === "phone"
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t("orders.searchByPhone")}
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  searchType === "orderId"
                    ? t("orders.orderIdPlaceholder")
                    : t("orders.phonePlaceholder")
                }
                aria-label={
                  searchType === "orderId"
                    ? t("orders.searchByOrderId")
                    : t("orders.searchByPhone")
                }
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? t("orders.searching") : t("orders.search")}
            </button>
          </form>
        </div>

        {notFound && !order && (
          <div className="mt-6 rounded-xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <SearchX className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{t("orders.notFoundTitle")}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {t("orders.notFoundSubtitle")}
            </p>
            <button
              type="button"
              onClick={handleSearchAgain}
              className="mt-5 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("orders.notFoundAction")}
            </button>
          </div>
        )}

        {order && (
          <>
            <div className="mt-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("orders.orderDetails", { id: order.id.slice(0, 8) })}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(order.createdAt)}</p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 px-3 py-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      {t("checkout.trackingCode")}
                    </span>
                    <code
                      className="text-sm font-bold tracking-wide text-[var(--color-primary)]"
                      dir="ltr"
                    >
                      {orderTrackingCode(order.id)}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(orderTrackingCode(order.id))}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                      aria-label={t("track.copy")}
                      title={t("track.copy")}
                    >
                      {codeCopied ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(order.status)}
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label={t("orders.refresh")}
                    title={t("orders.refresh")}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">{t("orders.autoRefresh")}</p>
            </div>

            <div className="mt-6">
              <OrderStatusTimeline
                status={order.status}
                paymentMethod={order.paymentMethod}
                paymentProofStatus={order.paymentProofStatus}
              />
            </div>

            {order.paymentMethod === "manual" && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm sm:p-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Wallet className="h-4 w-4" />
                  {t("track.paymentProof.title")}
                </h3>
                {(() => {
                  const proofStatus = order.paymentProofStatus || "NONE";
                  const map: Record<
                    string,
                    { label: string; className: string; desc: string }
                  > = {
                    PENDING: {
                      label: t("orders.proofs.statusPending"),
                      className: "bg-amber-100 text-amber-700",
                      desc: t("track.paymentProof.pendingDesc"),
                    },
                    APPROVED: {
                      label: t("orders.proofs.statusApproved"),
                      className: "bg-emerald-100 text-emerald-700",
                      desc: t("track.paymentProof.approvedDesc"),
                    },
                    REJECTED: {
                      label: t("orders.proofs.statusRejected"),
                      className: "bg-red-100 text-red-700",
                      desc: t("track.paymentProof.rejectedDesc"),
                    },
                    NONE: {
                      label: t("orders.proofs.statusNone"),
                      className: "bg-slate-100 text-slate-600",
                      desc: t("track.paymentProof.noneDesc"),
                    },
                  };
                  const entry = map[proofStatus] ?? map.NONE;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.className}`}
                      >
                        {entry.label}
                      </span>
                      <p className="text-xs text-emerald-800">{entry.desc}</p>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="mt-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    {t("orders.customerInfo")}
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="font-medium text-slate-900">{order.customerName}</span>
                    </div>
                    {order.customerPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="text-slate-600" dir="ltr">
                          {order.customerPhone}
                        </span>
                      </div>
                    )}
                    {order.customerAddress && (
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span className="text-slate-600">{order.customerAddress}</span>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    {t("orders.orderSummary")}
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">{t("orders.itemsCount")}</dt>
                      <dd className="font-medium text-slate-900">{order.items.length}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">{t("orders.invoice.subtotal")}</dt>
                      <dd className="font-medium text-slate-900">
                        {formattedPrice(
                          order.items.reduce(
                            (sum, item) => sum + parseFloat(item.unitPrice) * item.quantity,
                            0
                          )
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">{t("store.total")}</dt>
                      <dd className="text-lg font-bold text-[var(--color-primary)]">
                        {formattedPrice(parseFloat(order.totalAmount))}
                      </dd>
                    </div>
                    {order.notes && (
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span className="text-slate-600">{order.notes}</span>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--color-primary-soft)" }}>
                <h3 className="mb-3 text-sm font-medium text-slate-700">{t("orders.items")}</h3>
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {item.product?.imageUrl ? (
                          <Image
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            width={64}
                            height={64}
                            unoptimized={!canOptimizeImage(item.product.imageUrl)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-8 w-8 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900">
                          {item.product?.name || t("orders.productRemoved")}
                        </h4>
                        <p className="text-sm text-slate-500">
                          {t("orders.quantity", { count: item.quantity })} ·{" "}
                          {formattedPrice(parseFloat(item.unitPrice))}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-slate-900">
                        {formattedPrice(parseFloat(item.unitPrice) * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setInvoiceOpen(true)}
                disabled={!store}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                {t("orders.invoice.open")}
              </button>
              <Link
                href={storePath(slug)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t("orders.continueShopping")}
              </Link>
            </div>
          </>
        )}
      </main>

      <StoreFooter
        hasWhiteLabel={store?.hasWhiteLabel}
        containerClassName="mx-auto max-w-3xl px-4 text-center"
        icon={<Package className="h-4 w-4 text-[var(--color-primary)]" />}
      />

      {invoiceOpen && order && store && (
        <OrderInvoiceModal order={order} store={store} onClose={() => setInvoiceOpen(false)} />
      )}
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}

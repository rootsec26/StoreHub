"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Search,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  User,
  Phone,
  MapPin,
  FileText,
  Loader2,
  RotateCcw,
  Heart,
  Eye,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { storePath } from "@/lib/site";
import CurrencySelector, { useStoreCurrency } from "@/components/CurrencySelector";

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    price: string;
    stock: number;
    imageUrl: string | null;
    categoryId: string | null;
    isVisible: boolean;
  } | null;
}

interface Order {
  id: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalAmount: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

interface StoreData {
  id: string;
  name: string;
  slug: string;
  phone: string;
  accentColor: string;
  currency: string;
  supportedCurrencies: string[];
}

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const { t, locale, formatMoney } = useI18n();

  const [store, setStore] = useState<StoreData | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"orderId" | "phone">("orderId");
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    async function loadStore() {
      try {
        const res = await fetch(`/api/products?slug=${slug}&visible=true`);
        const data = await res.json();
        if (data.store) {
          setStore({
            id: data.store.id,
            name: data.store.name,
            slug: data.store.slug,
            phone: data.store.phone || "",
            accentColor: data.store.accentColor || "",
            currency: data.store.currency || "EGP",
            supportedCurrencies: data.store.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"],
          });
        }
      } catch {}
    }
    loadStore();
  }, [slug]);

  const { formattedPrice } = useStoreCurrency(
    store?.currency || "EGP",
    store?.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"],
    locale
  );

  const accent = store ? normalizeAccent(store.accentColor) : "";

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOrder(null);

    if (!searchQuery.trim()) {
      setError(t("orders.enterOrderIdOrPhone"));
      return;
    }

    setLoading(true);
    try {
      const searchParam = searchType === "orderId" ? "id" : "phone";
      const res = await fetch(`/api/orders/track?${searchParam}=${encodeURIComponent(searchQuery.trim())}&slug=${slug}`);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || t("orders.notFound"));
      }

      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("orders.searchFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!confirm(t("orders.confirmCancel"))) return;

    setCancelling(orderId);
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, storeSlug: slug }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || t("orders.cancelFailed"));
      }

      if (order && order.id === orderId) {
        setOrder({ ...order, status: "Cancelled", items: order.items.map(item => ({
          ...item,
          product: item.product ? { ...item.product, stock: item.product.stock + item.quantity } : null
        })) });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("orders.cancelFailed"));
    } finally {
      setCancelling(null);
    }
  }

  function getStatusBadge(status: string) {
    const statuses: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
      Pending: { label: t("orders.status.pending"), icon: <Clock className="h-4 w-4" />, color: "bg-amber-100 text-amber-800" },
      Confirmed: { label: t("orders.status.confirmed"), icon: <CheckCircle2 className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
      Preparing: { label: t("orders.status.preparing"), icon: <Package className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
      Ready: { label: t("orders.status.ready"), icon: <Truck className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800" },
      Shipped: { label: t("orders.status.shipped"), icon: <Truck className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800" },
      Completed: { label: t("orders.status.completed"), icon: <CheckCircle2 className="h-4 w-4 fill-current" />, color: "bg-emerald-100 text-emerald-800" },
      Cancelled: { label: t("orders.status.cancelled"), icon: <XCircle className="h-4 w-4" />, color: "bg-red-100 text-red-800" },
    };

    const s = statuses[status] || { label: status, icon: <AlertCircle className="h-4 w-4" />, color: "bg-slate-100 text-slate-800" };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${s.color}`}>
        {s.icon}
        {s.label}
      </span>
    );
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

  return (
    <div style={accentThemeStyle(accent)} className="min-h-screen bg-slate-50">
      {/* Header */}
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Search Form */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("orders.searchTitle")}</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("orders.searchBy")}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSearchType("orderId")}
                  className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                    searchType === "orderId"
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]"
                      : "border-slate-200 hover:border-slate-300"
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
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t("orders.searchByPhone")}
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchType === "orderId" ? t("orders.orderIdPlaceholder") : t("orders.phonePlaceholder")}
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                dir={searchType === "phone" ? "ltr" : undefined}
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

        {/* Order Details */}
        {order && (
          <>
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {t("orders.orderDetails", { id: order.id.slice(0, 8) })}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(order.createdAt)}</p>
                </div>
                {getStatusBadge(order.status)}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div>
                  <h4 className="mb-2 text-sm font-medium text-slate-700">{t("orders.customerInfo")}</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">{order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600" dir="ltr">{order.customerPhone}</span>
                    </div>
                    {order.customerAddress && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                        <span className="text-slate-600">{order.customerAddress}</span>
                      </div>
                    )}
                  </dl>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-medium text-slate-700">{t("orders.orderSummary")}</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t("orders.itemsCount")}</span>
                      <span className="font-medium text-slate-900">{order.items.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t("store.total")}</span>
                      <span className="font-bold text-[var(--color-primary)] text-lg">{formattedPrice(parseFloat(order.totalAmount))}</span>
                    </div>
                    {order.notes && (
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-slate-400 mt-0.5" />
                        <span className="text-slate-600">{order.notes}</span>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div className="border-t pt-4" style={{ borderColor: "var(--color-primary-soft)" }}>
                <h4 className="mb-3 text-sm font-medium text-slate-700">{t("orders.items")}</h4>
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
                      <div className="flex-1">
                        <h5 className="font-medium text-slate-900">{item.product?.name || t("orders.productRemoved")}</h5>
                        <p className="text-sm text-slate-500">
                          {t("orders.quantity", { count: item.quantity })} · {formattedPrice(parseFloat(item.unitPrice))}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{formattedPrice(parseFloat(item.unitPrice) * item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cancel Button for Pending Orders */}
            {order.status === "Pending" && (
              <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-amber-200" style={{ borderColor: "var(--color-primary-soft)" }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{t("orders.canCancel")}</p>
                    <p className="text-sm text-slate-500">{t("orders.canCancelDescription")}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelOrder(order.id)}
                  disabled={cancelling === order.id}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling === order.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("orders.cancelling")}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      {t("orders.cancelOrder")}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Continue Shopping */}
            <div className="mt-6 text-center">
              <Link
                href={storePath(slug)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                {t("orders.continueShopping")}
              </Link>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-6">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Package className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="text-sm font-medium text-slate-600">{t("store.poweredBy")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
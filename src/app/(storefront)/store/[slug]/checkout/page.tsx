"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Store,
  ShoppingCart,
  Package,
  User,
  Phone,
  MapPin,
  FileText,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";

import { useCartStore, type CartItem } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage } from "@/lib/images";
import {
  buildWhatsAppOrderText,
  buildWhatsAppOrderUrl,
} from "@/lib/whatsapp";

interface PlacedOrder {
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const { t, locale, formatMoney } = useI18n();
  const cart = useCartStore();

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAccent, setStoreAccent] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    async function loadStore() {
      try {
        const res = await fetch(`/api/products?slug=${slug}&visible=true`);
        const data = await res.json();
        if (data.store) {
          setStoreId(data.store.id);
          setStoreName(data.store.name);
          setStorePhone(data.store.phone || "");
          setStoreAccent(data.store.accentColor || "");
        }
      } catch {}
    }
    loadStore();
  }, [slug]);

  // Redirect if cart is empty
  useEffect(() => {
    if (cart.items.length === 0 && !success) {
      router.push(`/store/${slug}`);
    }
  }, [cart.items.length, success, slug, router]);

  const whatsappUrl = useMemo(() => {
    if (!success || !placedOrder || !orderId) return null;
    const text = buildWhatsAppOrderText(
      {
        storeName,
        orderId,
        items: placedOrder.items,
        total: placedOrder.total,
        customerName,
        customerPhone,
        customerAddress,
        notes,
      },
      locale
    );
    return buildWhatsAppOrderUrl(storePhone, text);
  }, [
    success,
    placedOrder,
    orderId,
    storeName,
    storePhone,
    customerName,
    customerPhone,
    customerAddress,
    notes,
    locale,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Snapshot the cart before clearing so the WhatsApp summary survives.
    const snapshot: PlacedOrder = {
      items: cart.items.map((item: CartItem) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.price),
      })),
      total: cart.getTotal(),
    };

    try {
      const items = cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
      }));

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          customerName,
          customerPhone,
          customerAddress,
          notes,
          items,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("checkout.failed"));
      }

      setOrderId(data.order.id);
      setPlacedOrder(snapshot);
      setSuccess(true);
      cart.clearCart();
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : t("checkout.failed")
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        style={accentThemeStyle(normalizeAccent(storeAccent))}
        className="flex min-h-screen items-center justify-center px-4"
      >
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 inline-flex rounded-full bg-emerald-100 p-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">
            {t("checkout.successTitle")}
          </h1>
          <p className="mb-2 text-slate-600">{t("checkout.successSubtitle")}</p>
          <p className="mb-8 text-sm text-slate-500" dir="ltr">
            {t("checkout.orderId", { id: `${orderId.slice(0, 8)}…` })}
          </p>

          <div className="space-y-3">
            {whatsappUrl ? (
              <>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("checkout.sendWhatsApp")}
                </a>
                <p className="text-xs text-slate-500">
                  {t("checkout.whatsappHint")}
                </p>
              </>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                {t("checkout.whatsappMissing")}
              </p>
            )}

            <Link
              href={`/store/${slug}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--store-accent)] px-6 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {t("checkout.continueShopping")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={accentThemeStyle(normalizeAccent(storeAccent))} className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={`/store/${slug}`}
            className="text-slate-400 hover:text-slate-600"
            aria-label={t("checkout.continueShopping")}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <Store className="h-5 w-5 text-[var(--store-accent)]" />
          <span className="flex-1 text-lg font-semibold text-slate-900">
            {storeName || t("checkout.customerDetails")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Customer Form */}
          <div className="lg:col-span-3">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                {t("checkout.customerDetails")}
              </h2>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("checkout.name")}
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t("checkout.namePlaceholder")}
                      required
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--store-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--store-accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("checkout.phone")}
                  </label>
                  <div className="relative">
                    <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      dir="ltr"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={t("checkout.phonePlaceholder")}
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--store-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--store-accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("checkout.address")}
                  </label>
                  <div className="relative">
                    <MapPin className="absolute start-3 top-3 h-4 w-4 text-slate-400" />
                    <textarea
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder={t("checkout.addressPlaceholder")}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--store-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--store-accent)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("checkout.notes")}
                  </label>
                  <div className="relative">
                    <FileText className="absolute start-3 top-3 h-4 w-4 text-slate-400" />
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t("checkout.notesPlaceholder")}
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--store-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--store-accent)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || cart.items.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--store-accent)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  {loading ? t("checkout.placingOrder") : t("checkout.placeOrder")}
                </button>
              </form>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                {t("checkout.orderSummary")}
              </h2>

              <div className="space-y-3">
                {cart.items.map((item) => (
                  <div key={item.productId} className="flex gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={48}
                          height={48}
                          unoptimized={!canOptimizeImage(item.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} × {formatMoney(item.price)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatMoney(parseFloat(item.price) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-900">
                    {t("store.total")}
                  </span>
                  <span className="text-xl font-bold text-[var(--store-accent)]">
                    {formatMoney(cart.getTotal())}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {t("checkout.itemsInCart", { count: cart.getItemCount() })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

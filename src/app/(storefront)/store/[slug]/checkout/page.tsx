"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  CreditCard,
  Smartphone,
  Banknote,
  Truck,
  Lock,
  AlertCircle,
  Zap,
  Sparkles,
} from "lucide-react";

import { useCartStore, type CartItem } from "@/lib/cart";
import CheckoutForm from "@/components/storefront/CheckoutForm";
import { useI18n } from "@/lib/i18n";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage } from "@/lib/images";
import {
  buildWhatsAppOrderText,
  buildWhatsAppOrderUrl,
} from "@/lib/whatsapp";
import { useStoreCurrency } from "@/components/CurrencySelector";
import { convertAndFormatPrice } from "@/lib/currency";
import type { CheckoutLoyaltyOutcome, VipTierRecord } from "@/lib/loyalty";

interface PlacedOrder {
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
}

type PaymentMethod = "stripe" | "paddle" | "manual" | "cod";

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  disabledReason?: string;
}

function CheckoutContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;

  // Guest arrived through a WhatsApp recovery link (?recover=…&code=…).
  const recoveryToken = searchParams.get("recover");
  const recoveryCode = searchParams.get("code");

  const { t, locale, formatMoney } = useI18n();
  const cart = useCartStore();

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAccent, setStoreAccent] = useState("");
  const [storeCurrency, setStoreCurrency] = useState("EGP");
  const [storeSupportedCurrencies, setStoreSupportedCurrencies] = useState<string[]>(["EGP", "USD", "SAR", "AED", "EUR"]);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [paddleEnabled, setPaddleEnabled] = useState(false);
  const [manualPaymentInstructions, setManualPaymentInstructions] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("stripe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [manualInstructions, setManualInstructions] = useState("");
  const [codVerifyNotice, setCodVerifyNotice] = useState("");
  const [codVerifyUrl, setCodVerifyUrl] = useState("");
  const [loyaltyRedeemed, setLoyaltyRedeemed] = useState(0);
  const [loyaltyResult, setLoyaltyResult] = useState<CheckoutLoyaltyOutcome | null>(null);
  const selectedPaymentMethodInitialized = useRef(false);

  const { currency: selectedCurrency } = useStoreCurrency(storeCurrency, storeSupportedCurrencies, locale);

  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  const paymentOptions = useMemo((): PaymentOption[] => [
    {
      id: "stripe",
      label: t("checkout.payment.stripe"),
      description: t("checkout.payment.stripeDesc"),
      icon: <CreditCard className="h-5 w-5" />,
      enabled: stripeEnabled,
      disabledReason: stripeEnabled ? undefined : t("checkout.payment.stripeDisabled"),
    },
    {
      id: "paddle",
      label: t("checkout.payment.paddle"),
      description: t("checkout.payment.paddleDesc"),
      icon: <Smartphone className="h-5 w-5" />,
      enabled: paddleEnabled,
      disabledReason: paddleEnabled ? undefined : t("checkout.payment.paddleDisabled"),
    },
    {
      id: "cod",
      label: t("checkout.payment.cod"),
      description: t("checkout.payment.codDesc"),
      icon: <Truck className="h-5 w-5" />,
      enabled: true,
      disabledReason: undefined,
    },
    {
      id: "manual",
      label: t("checkout.payment.manual"),
      description: t("checkout.payment.manualDesc"),
      icon: <Banknote className="h-5 w-5" />,
      enabled: true,
      disabledReason: undefined,
    },
  ], [stripeEnabled, paddleEnabled, t]);

  // Loyalty state
  const [loyalty, setLoyalty] = useState<{
    enabled: boolean;
    points: number;
    totalLifetimeSpend: number;
    vipTier: null | { tierName: string; discountPercentage: number; badgeColor: string };
    tiers: VipTierRecord[];
    redemptionRate: number;
  }>({
    enabled: false,
    points: 0,
    totalLifetimeSpend: 0,
    vipTier: null,
    tiers: [],
    redemptionRate: 10,
  });

  useEffect(() => {
    async function loadLoyalty() {
      try {
        if (!storeId) return;
        const params = new URLSearchParams({ storeId });
        if (customerPhone) params.set("phone", customerPhone);
        const res = await fetch(`/api/storefront/loyalty?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.enabled) {
          setLoyalty((prev) => ({ ...prev, enabled: false }));
          return;
        }

        const tiers: VipTierRecord[] = data.tiers ?? [];
        const spend = Number(data.profile?.totalLifetimeSpend) || 0;
        const points = Number(data.profile?.points) || 0;
        const redemptionRate = Number(data.settings?.redemptionRate) || 10;
        const vipTier =
          spend > 0 && tiers.length > 0
            ? tiers.find((tier) => spend >= tier.minSpendThreshold) ??
              tiers[tiers.length - 1]
            : null;

        setLoyalty({
          enabled: true,
          points,
          totalLifetimeSpend: spend,
          vipTier: vipTier
            ? {
                tierName: vipTier.tierName,
                discountPercentage: vipTier.discountPercentage,
                badgeColor: vipTier.badgeColor,
              }
            : null,
          tiers,
          redemptionRate,
        });
      } catch {
        // Silently fail - loyalty is optional
      }
    }

    loadLoyalty();

    // Keep the member balance fresh while the shopper types
    const loyaltyTimer = setInterval(loadLoyalty, 30000);
    return () => clearInterval(loyaltyTimer);
  }, [storeId, customerPhone]);

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
          setStoreCurrency(data.store.currency || "EGP");
          setStoreSupportedCurrencies(data.store.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"]);
          setStripeEnabled(data.store.stripeEnabled || false);
          setPaddleEnabled(data.store.paddleEnabled || false);
          setManualPaymentInstructions(data.store.manualPaymentInstructions || "");
          
          // Initialize payment method selection based on available options
          if (!selectedPaymentMethodInitialized.current) {
            const firstEnabled = data.store.stripeEnabled ? "stripe" : 
              data.store.paddleEnabled ? "paddle" : "manual";
            setSelectedPaymentMethod(firstEnabled);
            selectedPaymentMethodInitialized.current = true;
          }
        }
      } catch {}
    }
    loadStore();
  }, [slug]);

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

  // Compute loyalty discount amount from selected points
  const loyaltyDiscountAmount = useMemo(() => {
    if (!loyalty.enabled || loyaltyRedeemed <= 0 || loyalty.redemptionRate <= 0) {
      return 0;
    }
    // discount = points / redemptionRate (e.g., 100 points at rate 10 = 10 EGP)
    return Math.floor((loyaltyRedeemed / loyalty.redemptionRate) * 100) / 100;
  }, [loyalty.enabled, loyaltyRedeemed, loyalty.redemptionRate]);

  // Compute final total with loyalty discount
  const finalTotal = useMemo(() => {
    const subtotal = cart.getTotal();
    return Math.max(0, subtotal - loyaltyDiscountAmount);
  }, [cart, loyaltyDiscountAmount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

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
        unitPrice: parseFloat(item.price),
      }));

      // Loyalty (VIP discount + points redemption) is computed server-side
      // inside POST /api/checkout, which also finalizes the member's balance.
      const orderData = {
        storeId,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        notes,
        items,
        paymentMethod: selectedPaymentMethod,
        currency: storeCurrency,
        redeemPoints: loyaltyRedeemed,
        locale,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || t("checkout.failed"));
      }

      setOrderId(data.orderId || "");
      if (data.loyalty) {
        setLoyaltyResult(data.loyalty);
      }

      if (selectedPaymentMethod === "stripe" || selectedPaymentMethod === "paddle") {
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
      }

      if (selectedPaymentMethod === "manual" || selectedPaymentMethod === "cod") {
        if (selectedPaymentMethod === "cod") {
          setCodVerifyNotice(
            data.codVerification?.delivered
              ? t("checkout.codVerifyNotice")
              : t("orders.cod.pending")
          );
          setCodVerifyUrl(data.codVerification?.verifyUrl || "");
        } else {
          setManualInstructions(data.message || manualPaymentInstructions || "");
        }
        setPlacedOrder(snapshot);
        setSuccess(true);
        cart.clearCart();
        return;
      }

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

  // Headless abandoned-cart listener: keeps the guest cart snapshot in sync
  // while the shopper types, and closes it once the order is placed.
  const abandonedCartListener = (
    <CheckoutForm
      slug={slug}
      storeId={storeId}
      items={cart.items}
      totalAmount={cart.getTotal()}
      customerName={customerName}
      customerPhone={customerPhone}
      customerEmail={customerEmail}
      recoveryToken={recoveryToken}
      completed={success}
    />
  );

  if (success) {
    const isManual = selectedPaymentMethod === "manual";
    
    return (
      <div
        style={accentThemeStyle(normalizeAccent(storeAccent))}
        className="flex min-h-screen items-center justify-center px-4"
      >
        {abandonedCartListener}
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 inline-flex rounded-full bg-emerald-100 p-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">
            {isManual ? t("checkout.manualSuccessTitle") : t("checkout.successTitle")}
          </h1>
          <p className="mb-2 text-slate-600">
            {isManual ? t("checkout.manualSuccessSubtitle") : t("checkout.successSubtitle")}
          </p>
          <p className="mb-8 text-sm text-slate-500" dir="ltr">
            {t("checkout.orderId", { id: `${orderId.slice(0, 8)}…` })}
          </p>

          {isManual && manualInstructions && (
            <div className="mb-6 rounded-lg bg-blue-50 p-4 text-left text-sm text-blue-800">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {t("checkout.payment.instructions")}
              </h3>
              <p className="whitespace-pre-wrap">{manualInstructions}</p>
            </div>
          )}

          {selectedPaymentMethod === "cod" && codVerifyNotice && (
            <div className="mb-6 rounded-lg bg-amber-50 p-4 text-left text-sm text-amber-800">
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <MessageCircle className="h-4 w-4" />
                {t("verify.badge")}
              </h3>
              <p>{codVerifyNotice}</p>
              {codVerifyUrl && (
                <a
                  href={codVerifyUrl}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("verify.confirm")}
                </a>
              )}
            </div>
          )}

          {success && !isManual && loyaltyResult && (
            <div className="mb-6 rounded-lg bg-emerald-50 p-4 text-left text-emerald-700">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t("loyalty.pointsEarnedFromOrder", {
                  points: loyaltyResult.pointsEarned,
                })}
              </h3>
              <p className="text-sm mb-2">
                {t("loyalty.pointsBreakdown", {
                  earned: loyaltyResult.pointsEarned,
                  redeemed: loyaltyResult.pointsRedeemed,
                  bonus: loyaltyResult.bonusPoints,
                  discount: formatMoney(loyaltyResult.discountAmount),
                })}
              </p>
              <p className="text-sm">
                {t("loyalty.newBalance", {
                  balance: loyaltyResult.newBalance,
                })}
              </p>
              <p className="text-sm">
                {t("loyalty.newTier", {
                  tier: loyaltyResult.tierName || "—",
                })}
              </p>
            </div>
          )}

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

            {orderId && (
              <Link
                href={`/store/${slug}/track-order?id=${encodeURIComponent(orderId)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Package className="h-4 w-4" />
                {t("checkout.trackOrder")}
              </Link>
            )}

<Link
              href={`/store/${slug}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white hover:opacity-90"
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
      {abandonedCartListener}
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
          <Store className="h-5 w-5 text-[var(--color-primary)]" />
          <span className="flex-1 text-lg font-semibold text-slate-900">
            {storeName || t("checkout.customerDetails")}
          </span>
          {loyalty.enabled && (
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600">
                {loyalty.points} {t("loyalty.points")}
              </span>
            </div>
          )}
          {loyalty.vipTier && (
            <div className="ml-3 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  loyalty.vipTier.badgeColor
                    ? `bg-${loyalty.vipTier.badgeColor.replace(
                      "#",
                      ""
                    )}`
                    : "bg-slate-200"
                } text-slate-600`}
              >
                {loyalty.vipTier.tierName}
              </span>
              <span className="text-xs text-slate-500">
                {t("loyalty.discount", {
                  discount: loyalty.vipTier.discountPercentage,
                })} {t("loyalty.discountPercent")}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Customer Form + Payment Method */}
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
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("checkout.email")}
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder={t("checkout.emailPlaceholder")}
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
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
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
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
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
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
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-3 pt-2 border-t">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("checkout.payment.method")}
                  </label>
                  <div className="space-y-2" role="radiogroup" aria-label={t("checkout.payment.method")}>
                    {paymentOptions.map((option) => (
                      <label
                        key={option.id}
                        className={`relative flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                          selectedPaymentMethod === option.id
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                            : "border-slate-200 hover:border-slate-300"
                        } ${!option.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.id}
                          checked={selectedPaymentMethod === option.id}
                          onChange={() => option.enabled && setSelectedPaymentMethod(option.id)}
                          disabled={!option.enabled}
                          className="sr-only"
                        />
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                            selectedPaymentMethod === option.id
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                              : "border-slate-300"
                          }`}
                        >
                          {selectedPaymentMethod === option.id && (
                            <span className="h-2.5 w-2.5 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            {option.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{option.label}</p>
                            <p className="text-xs text-slate-500 truncate">{option.description}</p>
                            {option.disabledReason && (
                              <p className="text-xs text-amber-600">{option.disabledReason}</p>
                            )}
                          </div>
                        </div>
                        {selectedPaymentMethod === option.id && (
                          <Lock className="h-5 w-5 text-[var(--color-primary)]" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {recoveryCode && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3">
                    <span className="text-sm text-emerald-800">
                      {t("checkout.recoveryCodeLabel")}
                    </span>
                    <span
                      dir="ltr"
                      className="rounded bg-white px-2 py-1 text-sm font-bold tracking-wide text-emerald-700 ring-1 ring-emerald-200"
                    >
                      {recoveryCode}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || cart.items.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
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
                        {item.quantity} × {convertAndFormatPrice(parseFloat(item.price), storeCurrency, selectedCurrency, priceLocale)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {convertAndFormatPrice(parseFloat(item.price) * item.quantity, storeCurrency, selectedCurrency, priceLocale)}
                    </p>
                  </div>
                ))}

                {/* Loyalty Points Redemption */}
                {loyalty.enabled && loyalty.points > 0 && (
                  <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <h3 className="font-medium text-emerald-700 mb-3">
                      {t("loyalty.pointsToCash")}
                    </h3>
                    <p className="text-sm text-emerald-600 mb-3">
                      {t("loyalty.pointsAvailable", {
                        points: loyalty.points,
                      })}
                    </p>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {t("loyalty.redeemAmount")}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={loyalty.points}
                      value={loyaltyRedeemed}
                      onChange={(e) => setLoyaltyRedeemed(Number(e.target.value))}
                      className="w-full rounded-lg border border-emerald-300 py-2 ps-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                    />
                    <div className="mt-3 flex justify-between text-sm">
                      <span>
                        {t("loyalty.pointsToRedeem", { points: loyaltyRedeemed })}
                      </span>
                      <span className="font-medium text-emerald-600">
                        -{loyaltyRedeemed} {t("loyalty.points")}
                      </span>
                    </div>
                    {loyaltyDiscountAmount > 0 && (
                      <div className="mt-3 flex justify-between text-sm">
                        <span className="text-emerald-700">
                          {t("loyalty.discountApplied", { amount: convertAndFormatPrice(loyaltyDiscountAmount, storeCurrency, selectedCurrency, priceLocale) })}
                        </span>
                        <span className="font-medium text-emerald-600">
                          -{convertAndFormatPrice(loyaltyDiscountAmount, storeCurrency, selectedCurrency, priceLocale)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 border-t pt-4">
                {loyaltyDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                    <span>{t("store.subtotal")}</span>
                    <span>
                      {convertAndFormatPrice(cart.getTotal(), storeCurrency, selectedCurrency, priceLocale)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-900">
                    {t("store.total")}
                  </span>
                  <span className="text-xl font-bold text-[var(--color-primary)]">
                    {convertAndFormatPrice(finalTotal, storeCurrency, selectedCurrency, priceLocale)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {t("checkout.itemsInCart", { count: cart.getItemCount() })}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Package,
  Check,
  Sparkles,
  Loader2,
  AlertTriangle,
  Infinity as InfinityIcon,
  MessageSquare,
  CalendarClock,
  Minus,
  Plus,
  Palette,
  Users,
  Tag,
  Clock,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { BillingInfo, Plan } from "@/lib/types";
import {
  ACTIVATION_CODE_SPECS,
  AI_CREDIT_PACKAGES,
  INCLUDED_STAFF_SEATS,
  MAX_EXTRA_STAFF_SEATS,
  STAFF_SEAT_PRICE,
  WHATSAPP_CREDIT_PACKAGES,
  clampExtraStaffSeats,
  type CreditType,
  type BillingPackage,
} from "@/lib/billing-packages";
import PaymentModal, {
  type PaymentModalItem,
} from "@/components/billing/PaymentModal";
import ActivationAddonModal from "@/components/billing/ActivationAddonModal";

type TabId = "plan" | "credits" | "addons";

const TABS: Array<{ id: TabId; labelKey: TranslationKey }> = [
  { id: "plan", labelKey: "billing.tabs.plan" },
  { id: "credits", labelKey: "billing.tabs.credits" },
  { id: "addons", labelKey: "billing.tabs.addons" },
];

/** True when an ISO timestamp is missing or already in the past. */
function isPastDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

export default function BillingPage() {
  const { t, formatNumber, formatDate } = useI18n();

  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Voucher payment window: opened for plan upgrades AND credit top-ups.
  const [paymentItem, setPaymentItem] = useState<PaymentModalItem | null>(null);
  // Add-on activation modal
  const [activatingAddOn, setActivatingAddOn] = useState<"white_label" | "staff_seats" | null>(null);
  // Expiry flags derived when billing info arrives (never during render).
  const [creditWindow, setCreditWindow] = useState<{ ai: boolean; wa: boolean }>({
    ai: false,
    wa: false,
  });

  const [tab, setTab] = useState<TabId>("plan");
  const [savingAddOn, setSavingAddOn] = useState<string | null>(null);
  // Optimistic seat count while a save is in flight; falls back to the server value.
  const [pendingSeats, setPendingSeats] = useState<number | null>(null);
  // Dynamic pricing from DB
  const [pricing, setPricing] = useState<Record<string, BillingPackage>>({});
  const [pricingLoading, setPricingLoading] = useState(true);
  // Current time for countdown timers
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    // Fetch billing info
    fetch("/api/billing")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: BillingInfo | null) => {
        if (!cancelled && payload) applyInfo(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Fetch dynamic pricing
    fetch("/api/pricing")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { pricing: BillingPackage[] } | null) => {
        if (!cancelled && payload?.pricing) {
          const map: Record<string, BillingPackage> = {};
          for (const p of payload.pricing) {
            map[p.type] = p;
          }
          setPricing(map);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Timer for promo countdowns
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(() => Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  function patchInfo(next: Partial<BillingInfo>) {
    setInfo((prev) => (prev ? { ...prev, ...next } : prev));
  }

  /** Stores fresh billing info and refreshes the credit expiry flags. */
  function applyInfo(payload: BillingInfo) {
    setInfo(payload);
    setCreditWindow({
      ai: isPastDate(payload.aiCreditsExpiresAt),
      wa: isPastDate(payload.waCreditsExpiresAt),
    });
  }

  async function changePlan(plan: Plan) {
    if (!info || changing) return;
    const planNameKey = plan === "pro" ? "billing.planProName" : "billing.planFreeName";
    const planExpired = info.plan === "pro" && info.planActive === false;
    // Re-buying an expired Pro plan is allowed; other no-op switches are not.
    if (info.plan === plan && !(plan === "pro" && planExpired)) return;

    if (plan === "pro") {
      // Strict billing: upgrades are only possible through a paid voucher.
      const proPricing = pricing.PLAN_PRO;
      const effectivePrice = proPricing?.effectivePrice ?? ACTIVATION_CODE_SPECS.PLAN_PRO.price;
      setPaymentItem({
        kind: "plan",
        title: t("billing.planProName"),
        price: effectivePrice,
      });
      return;
    }
    setChanging(true);

    try {
      const res = await fetch("/api/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed to update plan");

      const payload: BillingInfo = await res.json();
      applyInfo(payload);
      setToast(
        t("billing.toast.changed", {
          plan: t(planNameKey),
        })
      );
    } catch {
      setToast(t("billing.toast.failed"));
    } finally {
      setChanging(false);
    }
  }

  /** "شحن الرصيد" — opens the payment window instead of granting free credits. */
  function openCreditPurchase(type: CreditType, packageId: string) {
    if (type === "ai") {
      const pkg = AI_CREDIT_PACKAGES.find((p) => p.id === packageId);
      if (!pkg) return;
      const pricingKey = pkg.id === "ai_500" ? "AI_CREDITS_500" : "AI_CREDITS_2000";
      const creditPricing = pricing[pricingKey];
      const effectivePrice = creditPricing?.effectivePrice ?? pkg.price;
      setPaymentItem({
        kind: "credit",
        title: t("billing.credits.unitAi", { count: formatNumber(pkg.credits) }),
        price: effectivePrice,
        creditType: "ai",
        credits: pkg.credits,
      });
      return;
    }

    const pkg = WHATSAPP_CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return;
    const pricingKey = pkg.id === "whatsapp_500" ? "WA_CREDITS_500" : "WA_CREDITS_2000";
    const creditPricing = pricing[pricingKey];
    const effectivePrice = creditPricing?.effectivePrice ?? pkg.price;
    setPaymentItem({
      kind: "credit",
      title: t("billing.credits.unitMessages", {
        count: formatNumber(pkg.messages),
      }),
      price: effectivePrice,
      creditType: "whatsapp",
      credits: pkg.messages,
    });
  }

  async function handleRedeemed(billing: BillingInfo | null) {
    if (billing && billing.storeId) {
      applyInfo(billing);
    } else {
      const updated = await fetch("/api/billing")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (updated?.storeId) applyInfo(updated);
    }
    setToast(t("billing.paymentModal.redeemedToast"));
  }

  async function handleAddOnRedeemed(billing: BillingInfo | null) {
    if (billing && billing.storeId) {
      applyInfo(billing);
    } else {
      const updated = await fetch("/api/billing")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (updated?.storeId) applyInfo(updated);
    }
    setActivatingAddOn(null);
    setPendingSeats(null);
    setToast(t("billing.paymentModal.redeemedToast"));
  }

  async function toggleWhiteLabel(enabled: boolean) {
    if (savingAddOn) return;
    if (enabled) {
      // Open activation modal instead of direct activation
      setActivatingAddOn("white_label");
    } else {
      // Disabling doesn't require a voucher
      setSavingAddOn("white_label");

      try {
        const res = await fetch("/api/billing/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addOn: "white_label", enabled: false }),
        });
        const data = await res.json();

        if (!res.ok) {
          setToast(t("billing.addons.toast.failed"));
          return;
        }

        patchInfo({ hasWhiteLabel: data.hasWhiteLabel === true });
        setToast(t("billing.addons.toast.whiteLabelOff"));
      } catch {
        setToast(t("billing.addons.toast.failed"));
      } finally {
        setSavingAddOn(null);
      }
    }
  }

  async function changeSeats(nextExtra: number) {
    if (savingAddOn) return;
    const clamped = clampExtraStaffSeats(nextExtra);
    
    // If increasing seats, require activation code
    if (clamped > extraSeats) {
      setPendingSeats(clamped);
      setActivatingAddOn("staff_seats");
      return;
    }
    
    // Decreasing seats doesn't require a voucher
    setPendingSeats(clamped);
    setSavingAddOn("staff_seats");

    try {
      const res = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOn: "staff_seats", quantity: clamped }),
      });
      const data = await res.json();

      if (!res.ok) {
        setToast(t("billing.addons.toast.failed"));
        setPendingSeats(null);
        return;
      }

      patchInfo({
        maxStaffSeats: data.maxStaffSeats,
        aiCredits: data.aiCredits,
        whatsappCredits: data.whatsappCredits,
      });
      setPendingSeats(null);
      setToast(
        t("billing.addons.toast.seatsUpdated", {
          count: formatNumber(data.maxStaffSeats),
        })
      );
    } catch {
      setPendingSeats(null);
      setToast(t("billing.addons.toast.failed"));
    } finally {
      setSavingAddOn(null);
    }
  }

  const percent = info?.usagePercent ?? 0;
  const atLimit =
    info !== null &&
    info.productLimit !== null &&
    info.productCount >= info.productLimit;

  const barColor = atLimit
    ? "bg-red-500"
    : percent >= 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  const aiCredits = info?.aiCredits ?? 0;
  const whatsappCredits = info?.whatsappCredits ?? 0;
  const aiCreditsExpired = creditWindow.ai;
  const waCreditsExpired = creditWindow.wa;
  const whiteLabelOn = info?.hasWhiteLabel ?? false;
  const extraSeats =
    pendingSeats ??
    Math.max(0, (info?.maxStaffSeats ?? INCLUDED_STAFF_SEATS) - INCLUDED_STAFF_SEATS);
  const totalSeats = INCLUDED_STAFF_SEATS + extraSeats;
  const seatsMonthlyPrice = extraSeats * STAFF_SEAT_PRICE;

  const planCards: Array<{
    id: Plan;
    nameKey: TranslationKey;
    priceKey: TranslationKey;
    descKey: TranslationKey;
    limitKey: TranslationKey;
    popular?: boolean;
    features: TranslationKey[];
  }> = [
    {
      id: "free",
      nameKey: "billing.planFreeName",
      priceKey: "billing.planFreePrice",
      descKey: "billing.planFreeDesc",
      limitKey: "billing.planFreeLimit",
      features: ["billing.planFreeLimit", "billing.feature.orderTracking", "billing.feature.analytics"],
    },
    {
      id: "pro",
      nameKey: "billing.planProName",
      priceKey: "billing.planProPrice",
      descKey: "billing.planProDesc",
      limitKey: "billing.planProLimit",
      popular: true,
      features: [
        "billing.planProLimit",
        "billing.feature.orderTracking",
        "billing.feature.analytics",
        "billing.feature.priority",
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("billing.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === item.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------- */}
      {/* Section 1: Subscription plan                   */}
      {/* ---------------------------------------------- */}
      {tab === "plan" && (
        <>
          {/* Usage */}
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Package className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {t("billing.usageTitle")}
                  </p>
                  <p className="text-xs text-slate-500">{t("billing.currentPlan")}:{" "}
                    {info?.plan === "pro"
                      ? t("billing.planProName")
                      : t("billing.planFreeName")}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  atLimit ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {info?.productLimit === null ? (
                  <>
                    <InfinityIcon className="h-3.5 w-3.5" />
                    {t("billing.planProLimit")}
                  </>
                ) : (
                  t("billing.usageLabel", {
                    used: formatNumber(info?.productCount ?? 0),
                    limit: formatNumber(info?.productLimit ?? 0),
                  })
                )}
              </span>
            </div>

            {loading ? (
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
            ) : (
              <>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${info?.productLimit === null ? 100 : percent}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {info?.productLimit === null
                      ? t("billing.usageUnlimited", {
                          used: formatNumber(info?.productCount ?? 0),
                        })
                      : t("billing.usageLabel", {
                          used: formatNumber(info?.productCount ?? 0),
                          limit: formatNumber(info?.productLimit ?? 0),
                        })}
                  </span>
                  {info?.productLimit !== null && !atLimit && (
                    <span>
                      {t("billing.remaining", {
                        count: formatNumber(
                          Math.max(0, (info?.productLimit ?? 0) - (info?.productCount ?? 0))
                        ),
                      })}
                    </span>
                  )}
                </div>
              </>
            )}

            {atLimit && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("billing.limitReached")}</span>
              </div>
            )}
          </div>

          {/* Plans */}
          <div className="grid gap-4 sm:grid-cols-2">
            {planCards.map((card) => {
              const planExpired =
                card.id === "pro" &&
                info?.plan === "pro" &&
                info.planActive === false;
              const isCurrent =
                info?.plan === card.id && (card.id === "free" || !planExpired);

              // Dynamic pricing for Pro plan
              const proPricing = pricing.PLAN_PRO;
              const effectiveProPrice = proPricing?.effectivePrice ?? ACTIVATION_CODE_SPECS.PLAN_PRO.price;
              const hasActiveProPromo = proPricing?.hasActivePromo ?? false;
              const isProPromoPrice = hasActiveProPromo && effectiveProPrice < ACTIVATION_CODE_SPECS.PLAN_PRO.price;
              // Countdown for active promo
              const proPromoTimeRemaining = proPricing?.hasActivePromo && proPricing?.promoTimeRemaining
                ? proPricing.promoTimeRemaining
                : 0;
              const proPromoDays = Math.ceil(proPromoTimeRemaining / (1000 * 60 * 60 * 24));
              const proPromoHours = Math.ceil((proPromoTimeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

              return (
                <div
                  key={card.id}
                  className={`relative flex flex-col rounded-xl bg-white p-6 shadow-sm transition-shadow ${
                    card.popular ? "ring-2 ring-indigo-500" : ""
                  }`}
                >
                  {card.popular && (
                    <span className="absolute -top-3 end-4 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <Sparkles className="h-3 w-3" />
                      {t("billing.popular")}
                    </span>
                  )}

                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                      {t(card.nameKey)}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">
                        {t("billing.currentBadge")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {card.id === "pro" ? (
                      <>
                        {isProPromoPrice ? (
                          <>
                            <span className="line-through text-slate-400 mr-2">
                              {t("billing.priceEgp", { price: formatNumber(ACTIVATION_CODE_SPECS.PLAN_PRO.price) })}
                            </span>
                            <span className="text-emerald-600">
                              {t("billing.priceEgp", { price: formatNumber(effectiveProPrice) })}
                            </span>
                          </>
                        ) : (
                          t("billing.priceEgp", { price: formatNumber(effectiveProPrice) })
                        )}
                        {isProPromoPrice && (
                          <>
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-600">
                              <Tag className="h-3.5 w-3.5" />
                              Promo
                            </span>
                            {proPromoTimeRemaining > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                                <Clock className="h-3 w-3" />
                                {t("billing.promoExpiresIn", {
                                  time: proPromoDays > 0 ? `${proPromoDays}d ${proPromoHours}h` : `${proPromoHours}h`,
                                })}
                              </span>
                            )}
                          </>
                        )}
                        {(!isProPromoPrice && pricingLoading) && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-sm font-semibold text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          </span>
                        )}
                      </>
                    ) : (
                      t(card.priceKey)
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{t(card.descKey)}</p>

                  {planExpired && (
                    <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("billing.planExpired")}
                    </p>
                  )}

                  {!planExpired &&
                    card.id === "pro" &&
                    info?.plan === "pro" &&
                    info.planExpiresAt && (
                      <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {t("billing.planExpiresOn", {
                          date: formatDate(info.planExpiresAt),
                        })}
                      </p>
                    )}

                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                    {card.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        {t(feature)}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => changePlan(card.id)}
                    disabled={loading || changing || isCurrent}
                    className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isCurrent
                        ? "border border-slate-200 text-slate-400"
                        : card.id === "pro"
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {changing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isCurrent
                      ? t("billing.currentBadge")
                      : planExpired
                        ? t("billing.renewPlan")
                        : card.id === "pro"
                          ? t("billing.upgrade")
                          : t("billing.downgrade")}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              {t("billing.mockNote")}
            </span>
            <Link
              href="/dashboard/products"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              {t("nav.products")}
            </Link>
          </div>
        </>
      )}

      {/* ---------------------------------------------- */}
      {/* Section 2: Pay-per-use credits top-up          */}
      {/* ---------------------------------------------- */}
      {tab === "credits" && (
        <>
          {/* Balances */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {t("billing.credits.aiBalance")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("billing.credits.aiDesc")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">
                {loading ? "—" : formatNumber(aiCredits)}
              </p>
              {aiCreditsExpired ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("billing.credits.expiredNotice")}
                </p>
              ) : (
                <>
                  {info?.aiCreditsExpiresAt && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {t("billing.credits.expiresOn", {
                        date: formatDate(info.aiCreditsExpiresAt),
                      })}
                    </p>
                  )}
                  {aiCredits <= 0 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("billing.credits.lowBalance")}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {t("billing.credits.whatsAppBalance")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("billing.credits.whatsAppDesc")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">
                {loading ? "—" : formatNumber(whatsappCredits)}
              </p>
              {waCreditsExpired ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("billing.credits.expiredNotice")}
                </p>
              ) : (
                <>
                  {info?.waCreditsExpiresAt && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {t("billing.credits.expiresOn", {
                        date: formatDate(info.waCreditsExpiresAt),
                      })}
                    </p>
                  )}
                  {whatsappCredits <= 0 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("billing.credits.lowBalance")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* AI credits packages */}
          <div className="mb-4 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-lg bg-indigo-50 p-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t("billing.credits.aiPackages")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("billing.credits.packagesHint")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {AI_CREDIT_PACKAGES.map((pkg) => {
                const pricingKey = pkg.id === "ai_500" ? "AI_CREDITS_500" : "AI_CREDITS_2000";
                const creditPricing = pricing[pricingKey];
                const effectivePrice = creditPricing?.effectivePrice ?? pkg.price;
                const hasActivePromo = creditPricing?.hasActivePromo ?? false;
                const isPromoPrice = hasActivePromo && effectivePrice < pkg.price;
                // Countdown for active promo
                const promoTimeRemaining = creditPricing?.hasActivePromo && creditPricing?.promoTimeRemaining
                  ? creditPricing.promoTimeRemaining
                  : 0;
                const promoDays = Math.ceil(promoTimeRemaining / (1000 * 60 * 60 * 24));
                const promoHours = Math.ceil((promoTimeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                return (
                  <div
                    key={pkg.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {t("billing.credits.unitAi", {
                          count: formatNumber(pkg.credits),
                        })}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isPromoPrice ? (
                          <>
                            <span className="line-through text-slate-400 mr-1">
                              {t("billing.priceEgp", { price: formatNumber(pkg.price) })}
                            </span>
                            <span className="text-emerald-600 font-semibold">
                              {t("billing.priceEgp", { price: formatNumber(effectivePrice) })}
                            </span>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {t("billing.priceEgp", { price: formatNumber(effectivePrice) })}
                          </p>
                        )}
                        {isPromoPrice && (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                              <Tag className="h-2.5 w-2.5" />
                              Promo
                            </span>
                            {promoTimeRemaining > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                <Clock className="h-2 w-2" />
                                {t("billing.promoExpiresIn", {
                                  time: promoDays > 0 ? `${promoDays}d ${promoHours}h` : `${promoHours}h`,
                                })}
                              </span>
                            )}
                          </>
                        )}
                        {!isPromoPrice && pricingLoading && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openCreditPurchase("ai", pkg.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                    >
                      {t("billing.credits.recharge")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* WhatsApp SMS packages */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-2">
                <MessageSquare className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t("billing.credits.whatsAppPackages")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("billing.credits.packagesHint")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {WHATSAPP_CREDIT_PACKAGES.map((pkg) => {
                const pricingKey = pkg.id === "whatsapp_500" ? "WA_CREDITS_500" : "WA_CREDITS_2000";
                const creditPricing = pricing[pricingKey];
                const effectivePrice = creditPricing?.effectivePrice ?? pkg.price;
                const hasActivePromo = creditPricing?.hasActivePromo ?? false;
                const isPromoPrice = hasActivePromo && effectivePrice < pkg.price;
                // Countdown for active promo
                const promoTimeRemaining = creditPricing?.hasActivePromo && creditPricing?.promoTimeRemaining
                  ? creditPricing.promoTimeRemaining
                  : 0;
                const promoDays = Math.ceil(promoTimeRemaining / (1000 * 60 * 60 * 24));
                const promoHours = Math.ceil((promoTimeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                return (
                  <div
                    key={pkg.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {t("billing.credits.unitMessages", {
                          count: formatNumber(pkg.messages),
                        })}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isPromoPrice ? (
                          <>
                            <span className="line-through text-slate-400 mr-1">
                              {t("billing.priceEgp", { price: formatNumber(pkg.price) })}
                            </span>
                            <span className="text-emerald-600 font-semibold">
                              {t("billing.priceEgp", { price: formatNumber(effectivePrice) })}
                            </span>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {t("billing.priceEgp", { price: formatNumber(effectivePrice) })}
                          </p>
                        )}
                        {isPromoPrice && (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                              <Tag className="h-2.5 w-2.5" />
                              Promo
                            </span>
                            {promoTimeRemaining > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                <Clock className="h-2 w-2" />
                                {t("billing.promoExpiresIn", {
                                  time: promoDays > 0 ? `${promoDays}d ${promoHours}h` : `${promoHours}h`,
                                })}
                              </span>
                            )}
                          </>
                        )}
                        {!isPromoPrice && pricingLoading && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openCreditPurchase("whatsapp", pkg.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                    >
                      {t("billing.credits.recharge")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <CreditCard className="h-3.5 w-3.5" />
            {t("billing.credits.mockNote")}
          </div>
        </>
      )}

      {/* ---------------------------------------------- */}
      {/* Section 3: Power add-ons (monthly)             */}
      {/* ---------------------------------------------- */}
      {tab === "addons" && (
        <>
          {/* White-labeling */}
          <div className="mb-4 rounded-xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-violet-50 p-2">
                  <Palette className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {t("billing.addons.whiteLabelTitle")}
                    </p>
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600">
                      {t("billing.addons.badge")}
                    </span>
                  </div>
                  <p className="mt-1 max-w-md text-xs text-slate-500">
                    {t("billing.addons.whiteLabelDesc")}
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    {t("billing.addons.whiteLabelPrice")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    whiteLabelOn
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {whiteLabelOn
                    ? t("billing.addons.statusOn")
                    : t("billing.addons.statusOff")}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={whiteLabelOn}
                  aria-label={t("billing.addons.whiteLabelTitle")}
                  onClick={() => toggleWhiteLabel(!whiteLabelOn)}
                  disabled={loading || savingAddOn !== null}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    whiteLabelOn ? "bg-violet-600" : "bg-slate-300"
                  }`}
                >
                  {savingAddOn === "white_label" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        whiteLabelOn ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Extra staff seats */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-50 p-2">
                <Users className="h-5 w-5 text-sky-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("billing.addons.seatsTitle")}
                  </p>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                    {t("billing.addons.badge")}
                  </span>
                </div>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  {t("billing.addons.seatsDesc")}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => changeSeats(extraSeats - 1)}
                      disabled={loading || savingAddOn !== null || extraSeats <= 0}
                      aria-label={t("billing.addons.seatDecrease")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-10 text-center text-lg font-bold text-slate-900">
                      {formatNumber(extraSeats)}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeSeats(extraSeats + 1)}
                      disabled={
                        loading ||
                        savingAddOn !== null ||
                        extraSeats >= MAX_EXTRA_STAFF_SEATS
                      }
                      aria-label={t("billing.addons.seatIncrease")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-slate-500">
                      {t("billing.addons.extraSeats", {
                        count: formatNumber(extraSeats),
                      })}
                    </span>
                    {savingAddOn === "staff_seats" && (
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    )}
                  </div>

                  <div className="text-end">
                    <p className="text-xs text-slate-500">
                      {t("billing.addons.seatsTotal", {
                        count: formatNumber(totalSeats),
                      })}
                    </p>
                    <p className="text-sm font-bold text-slate-900">
                      {t("billing.addons.monthlyTotal", {
                        price: formatNumber(seatsMonthlyPrice),
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <CreditCard className="h-3.5 w-3.5" />
            Add-ons require a paid activation code — no demo mode.
          </div>
        </>
      )}

      {/* Voucher payment modal — shared by plan upgrades and credit top-ups */}
      <PaymentModal
        key={
          paymentItem
            ? `payment-${paymentItem.kind}-${paymentItem.title}-${paymentItem.price}`
            : "payment-closed"
        }
        item={paymentItem}
        onClose={() => setPaymentItem(null)}
        onRedeemed={handleRedeemed}
      />

      {/* Add-on activation modal */}
      <ActivationAddonModal
        key={`addon-activation-${activatingAddOn ?? "closed"}`}
        addOn={activatingAddOn}
        onClose={() => {
          setActivatingAddOn(null);
          setPendingSeats(null);
        }}
        onRedeemed={handleAddOnRedeemed}
      />
    </div>
  );
}

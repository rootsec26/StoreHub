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
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { BillingInfo, Plan } from "@/lib/types";

export default function BillingPage() {
  const { t, formatNumber } = useI18n();

  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/billing")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: BillingInfo | null) => {
        if (!cancelled && payload) setInfo(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  async function changePlan(plan: Plan) {
    if (!info || info.plan === plan || changing) return;
    setChanging(true);

    try {
      const res = await fetch("/api/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed to update plan");

      const payload: BillingInfo = await res.json();
      setInfo(payload);
      setToast(
        t("billing.toast.changed", {
          plan:
            plan === "pro" ? t("billing.planProName") : t("billing.planFreeName"),
        })
      );
    } catch {
      setToast(t("billing.toast.failed"));
    } finally {
      setChanging(false);
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
          const isCurrent = info?.plan === card.id;

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
                {t(card.priceKey)}
              </p>
              <p className="mt-1 text-sm text-slate-500">{t(card.descKey)}</p>

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
    </div>
  );
}

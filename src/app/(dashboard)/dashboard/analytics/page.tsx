"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  DollarSign,
  ShoppingCart,
  ReceiptText,
  TrendingUp,
  Package,
  Sparkles,
  Lightbulb,
  Loader2,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import { canOptimizeImage } from "@/lib/images";
import type { AnalyticsBucket, AnalyticsResponse } from "@/lib/types";

type Period = "daily" | "weekly";

interface ChartPoint {
  key: string;
  label: string;
  value: number;
  orders: number;
}

function BarChart({
  points,
  accentClass,
  formatValue,
  labelEvery = 1,
}: {
  points: ChartPoint[];
  accentClass: string;
  formatValue: (value: number) => string;
  labelEvery?: number;
}) {
  const max = Math.max(...points.map((p) => p.value), 0);

  return (
    <div>
      <div className="flex h-52 items-end gap-1.5">
        {points.map((point) => {
          const height =
            max > 0 && point.value > 0
              ? Math.max(3, (point.value / max) * 100)
              : point.value > 0
                ? 3
                : 2;

          return (
            <div
              key={point.key}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow group-hover:block">
                {point.label} · {formatValue(point.value)}
                {point.orders > 0 && ` · ${point.orders}`}
              </div>
              <div
                className={`w-full rounded-t ${accentClass} transition-opacity hover:opacity-80`}
                style={{ height: `${height}%` }}
                title={`${point.label}: ${formatValue(point.value)}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {points.map((point, index) => (
          <span
            key={point.key}
            className={`flex-1 text-center text-[10px] text-slate-400 ${
              index % labelEvery === 0 ? "" : "invisible"
            }`}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t, formatMoney, formatNumber } = useI18n();

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("daily");

  const [insights, setInsights] = useState<string[]>([]);
  const [insightsSource, setInsightsSource] = useState<
    "openai" | "mock" | null
  >(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: AnalyticsResponse | null) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lastEvent]);

  async function loadInsights() {
    if (!data) return;

    setInsightsLoading(true);
    setInsightsError(null);

    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalOrders: data.summary.totalOrders,
          totalRevenue: data.summary.totalRevenue,
          avgOrderValue: data.summary.avgOrderValue,
          topProducts: data.topProducts.map((product) => ({
            name: product.name,
            quantity: product.quantity,
            revenue: product.revenue,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to generate insights");

      const payload = (await res.json()) as {
        insights?: string[];
        source?: "openai" | "mock";
      };
      if (!Array.isArray(payload.insights) || payload.insights.length === 0) {
        throw new Error("Empty insights");
      }

      setInsights(payload.insights);
      setInsightsSource(payload.source ?? null);
    } catch {
      setInsightsError(t("analytics.insights.failed"));
    } finally {
      setInsightsLoading(false);
    }
  }

  const buckets: AnalyticsBucket[] = useMemo(
    () => (period === "daily" ? data?.daily ?? [] : data?.weekly ?? []),
    [data, period]
  );

  const revenuePoints: ChartPoint[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label.slice(5),
    value: parseFloat(bucket.revenue) || 0,
    orders: bucket.orders,
  }));

  const aovPoints: ChartPoint[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label.slice(5),
    value: bucket.orders > 0 ? (parseFloat(bucket.revenue) || 0) / bucket.orders : 0,
    orders: bucket.orders,
  }));

  const hasRevenue = revenuePoints.some((point) => point.value > 0);

  const avgDaily = data && data.daily.length > 0
    ? (
        data.daily.reduce((sum, b) => sum + (parseFloat(b.revenue) || 0), 0) /
        data.daily.length
      ).toFixed(2)
    : "0.00";

  const topProducts = data?.topProducts ?? [];
  const maxTopQuantity = Math.max(...topProducts.map((p) => p.quantity), 1);

  const stats = [
    {
      label: t("analytics.totalRevenue"),
      value: formatMoney(data?.summary.totalRevenue ?? "0"),
      icon: DollarSign,
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: t("analytics.totalOrders"),
      value: formatNumber(data?.summary.totalOrders ?? 0),
      icon: ShoppingCart,
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {
      label: t("analytics.aov"),
      value: formatMoney(data?.summary.avgOrderValue ?? "0"),
      icon: ReceiptText,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
    {
      label: t("analytics.avgDaily"),
      value: formatMoney(avgDaily),
      icon: TrendingUp,
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
  ];

  return (
    <div>
      <p className="mb-6 text-sm text-slate-500">{t("analytics.subtitle")}</p>

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-8 w-20 rounded bg-slate-200" />
              </div>
            ))
          : stats.map((card) => (
              <div key={card.label} className="rounded-xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">{card.label}</p>
                  <div className={`shrink-0 rounded-lg ${card.bgColor} p-2`}>
                    <card.icon className={`h-4 w-4 ${card.textColor}`} />
                  </div>
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">{card.value}</p>
              </div>
            ))}
      </div>

      {/* Revenue trend */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("analytics.revenueTrend")}
            </h3>
            <p className="text-xs text-slate-500">
              {t("analytics.ordersCount", { count: formatNumber(data?.summary.totalOrders ?? 0) })}
            </p>
          </div>

          <div className="inline-flex self-start rounded-lg border border-slate-200 p-0.5">
            {(["daily", "weekly"] as Period[]).map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  period === value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {value === "daily" ? t("analytics.daily") : t("analytics.weekly")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-52 animate-pulse rounded-lg bg-slate-100" />
        ) : !hasRevenue ? (
          <div className="flex h-52 flex-col items-center justify-center gap-2 text-slate-400">
            <TrendingUp className="h-8 w-8" />
            <p className="text-sm">{t("analytics.chartEmpty")}</p>
          </div>
        ) : (
          <BarChart
            points={revenuePoints}
            accentClass="bg-indigo-500"
            formatValue={(value) => formatMoney(value)}
            labelEvery={period === "daily" ? 2 : 1}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 5 best sellers */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-lg font-semibold text-slate-900">
            {t("analytics.topProducts")}
          </h3>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center gap-2 text-slate-400">
              <Package className="h-8 w-8" />
              <p className="text-sm">{t("analytics.topProductsEmpty")}</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {topProducts.map((product, index) => (
                <li key={product.productId}>
                  <div className="mb-1.5 flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-bold text-slate-400">
                      {index + 1}
                    </span>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          width={36}
                          height={36}
                          unoptimized={!canOptimizeImage(product.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("analytics.soldCount", { count: formatNumber(product.quantity) })}
                        {" · "}
                        {formatMoney(product.revenue)}
                      </p>
                    </div>
                  </div>
                  <div className="ms-8 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${Math.max(4, (product.quantity / maxTopQuantity) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AOV trend */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("analytics.aovTrend")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("analytics.aov")}: {formatMoney(data?.summary.avgOrderValue ?? "0")}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <ReceiptText className="h-4 w-4 text-amber-600" />
            </div>
          </div>

          {loading ? (
            <div className="h-52 animate-pulse rounded-lg bg-slate-100" />
          ) : !hasRevenue ? (
            <div className="flex h-52 flex-col items-center justify-center gap-2 text-slate-400">
              <ReceiptText className="h-8 w-8" />
              <p className="text-sm">{t("analytics.chartEmpty")}</p>
            </div>
          ) : (
            <BarChart
              points={aovPoints}
              accentClass="bg-amber-400"
              formatValue={(value) => formatMoney(value)}
              labelEvery={period === "daily" ? 2 : 1}
            />
          )}
        </div>
      </div>

      {/* AI Business Insights */}
      <div className="mt-6 rounded-xl border border-violet-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-violet-50 p-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t("analytics.insights.title")}
                </h3>
                {insightsSource === "mock" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {t("ai.mockBadge")}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {t("analytics.insights.subtitle")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadInsights}
            disabled={insightsLoading || !data}
            title={!data ? t("analytics.insights.unavailable") : undefined}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {insightsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {insightsLoading
              ? t("analytics.insights.generating")
              : insights.length > 0
                ? t("ai.regenerate")
                : t("analytics.insights.generate")}
          </button>
        </div>

        {insightsLoading && insights.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : insightsError ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            <Lightbulb className="h-4 w-4 shrink-0" />
            {insightsError}
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <Lightbulb className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">
              {data
                ? t("analytics.insights.pending")
                : t("analytics.insights.unavailable")}
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {insights.map((insight, index) => (
              <li
                key={index}
                dir="auto"
                className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-700">
                  {insight}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

    </div>
  );
}

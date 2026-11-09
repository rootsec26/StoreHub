"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Eye,
  Loader2,
  MousePointerClick,
  Percent,
  RefreshCw,
  ShoppingCart,
  UserPlus,
  Users,
} from "lucide-react";

import type {
  AdminAnalyticsActivityItem,
  AdminAnalyticsBucket,
  AdminAnalyticsPeriod,
  AdminAnalyticsResponse,
} from "@/lib/admin-analytics-types";
import { cn } from "@/components/ui/cn";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(numeric) ? numeric : 0);
  } catch {
    return `${currency} ${(Number.isFinite(numeric) ? numeric : 0).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}`;
  }
}

function revenueHint(data: AdminAnalyticsResponse): string {
  const rows = data.summary.revenueByCurrency;
  if (rows.length === 0) return "No paid revenue recorded yet";
  const visible = rows.slice(0, 3).map((row) => formatMoney(row.amount, row.currency));
  const extra = rows.length > 3 ? ` +${rows.length - 3}` : "";
  return visible.join(" · ") + extra;
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Eye;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <span className={cn("rounded-xl p-2.5", tone)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{hint}</p>
    </div>
  );
}

function TrafficChart({ series }: { series: AdminAnalyticsBucket[] }) {
  const width = 760;
  const height = 260;
  const padding = { top: 24, right: 18, bottom: 42, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const count = Math.max(series.length, 1);
  const maxPageViews = Math.max(...series.map((point) => point.pageViews), 1);
  const maxSignups = Math.max(...series.map((point) => point.signups), 1);
  const labelEvery = count > 10 ? 2 : 1;

  const xFor = (index: number) =>
    padding.left +
    (count === 1 ? plotWidth / 2 : (index * plotWidth) / (count - 1));

  const yFor = (value: number, max: number) =>
    padding.top + plotHeight - (value / max) * plotHeight;

  const signupPoints = series
    .map((point, index) => `${xFor(index)},${yFor(point.signups, maxSignups)}`)
    .join(" ");

  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div dir="ltr" className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-w-[680px] w-full"
        role="img"
        aria-label="Traffic and registration trend"
      >
        {gridValues.map((ratio) => {
          const y = padding.top + plotHeight - ratio * plotHeight;
          const value = Math.round(maxPageViews * ratio);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[11px]"
              >
                {formatCompact(value)}
              </text>
            </g>
          );
        })}

        {series.map((point, index) => {
          const slot = plotWidth / count;
          const barWidth = Math.max(8, slot * 0.56);
          const barX = padding.left + index * slot + (slot - barWidth) / 2;
          const barHeight = Math.max(
            point.pageViews > 0 ? 4 : 2,
            (point.pageViews / maxPageViews) * plotHeight
          );
          const barY = padding.top + plotHeight - barHeight;

          return (
            <g key={point.key}>
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx="5"
                fill="#6366f1"
                opacity={point.pageViews > 0 ? 0.9 : 0.25}
              >
                <title>{`${point.label}: ${formatNumber(point.pageViews)} page views, ${formatNumber(point.uniqueVisitors)} visitors, ${formatNumber(point.signups)} signups`}</title>
              </rect>
              {index % labelEvery === 0 && (
                <text
                  x={xFor(index)}
                  y={height - 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[11px]"
                >
                  {point.label.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        <polyline
          points={signupPoints}
          fill="none"
          stroke="#059669"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {series.map((point, index) => (
          <circle
            key={`signup-${point.key}`}
            cx={xFor(index)}
            cy={yFor(point.signups, maxSignups)}
            r="4"
            fill="#059669"
            stroke="#ffffff"
            strokeWidth="2"
          >
            <title>{`${point.label}: ${formatNumber(point.signups)} registrations`}</title>
          </circle>
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />
          Page views
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Registrations
        </span>
        <span className="ms-auto hidden text-slate-400 sm:block">
          Hover points for exact values
        </span>
      </div>
    </div>
  );
}

function ActivityIcon({ type }: { type: AdminAnalyticsActivityItem["type"] }) {
  const className = "h-4 w-4";
  if (type === "PAGE_VIEW") return <MousePointerClick className={className} />;
  if (type === "REGISTRATION") return <UserPlus className={className} />;
  return <ShoppingCart className={className} />;
}

export default function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState<AdminAnalyticsPeriod>("daily");
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load analytics");
      setData((await res.json()) as AdminAnalyticsResponse);
    } catch {
      setError("Analytics could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = period === "daily" ? "Last 14 days" : "Last 8 weeks";

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Analytics & insights
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Platform traffic, registrations, orders and conversion trends.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(["daily", "weekly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  period === value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {value === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {data && !data.trackingAvailable && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Page-view tracking is not available yet. Apply{" "}
          <code className="rounded bg-amber-100 px-1">supabase/migrations/0024_analytics_events.sql</code>{" "}
          to start collecting visits. Registration, order and revenue metrics are already live.
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : error && !data ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-70")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Unique visitors"
              value={formatNumber(data.summary.uniqueVisitors)}
              hint={`${formatNumber(data.summary.pageViews)} total page views · ${periodLabel}: ${formatNumber(data.periodSummary.pageViews)} views / ${formatNumber(data.periodSummary.uniqueVisitors)} visitors`}
              icon={Eye}
              tone="bg-indigo-50 text-indigo-600"
            />
            <KpiCard
              label="Registrations"
              value={formatNumber(data.summary.totalUsers)}
              hint={`${formatNumber(data.summary.usersLast7Days)} new in the last 7 days · ${periodLabel}: ${formatNumber(data.periodSummary.signups)} signups`}
              icon={Users}
              tone="bg-emerald-50 text-emerald-600"
            />
            <KpiCard
              label="Orders & revenue"
              value={formatNumber(data.summary.totalOrders)}
              hint={revenueHint(data)}
              icon={ShoppingCart}
              tone="bg-amber-50 text-amber-600"
            />
            <KpiCard
              label="Conversion rate"
              value={`${data.summary.conversionRate.toFixed(2)}%`}
              hint={`${formatNumber(data.summary.convertedVisitors)} converted visitors all-time · ${periodLabel}: ${data.periodSummary.conversionRate.toFixed(2)}%`}
              icon={Percent}
              tone="bg-rose-50 text-rose-600"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Visits & registrations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Page views as bars, new accounts as a trend line.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                  {period === "daily" ? "Daily" : "Weekly"}
                </span>
              </div>
              <TrafficChart series={data.series} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Recent activity</h3>
                  <p className="text-xs text-slate-500">
                    Latest visits, registrations and orders.
                  </p>
                </div>
                <Activity className="h-4 w-4 text-slate-400" />
              </div>

              {data.recentActivity.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No recent activity yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.recentActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                    >
                      <span className="mt-0.5 rounded-lg bg-white p-2 text-indigo-600 shadow-sm">
                        <ActivityIcon type={item.type} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {formatActivityTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500" dir="ltr">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

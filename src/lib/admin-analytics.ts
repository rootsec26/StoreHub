import "server-only";

import { and, desc, eq, gte, sql, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import {
  analyticsEvents,
  orders,
  stores,
  users,
} from "@/db/schema";
import { extractDbErrorInfo, formatErrorForLog } from "@/lib/errors";
import {
  REVENUE_ORDER_STATUS,
  REVENUE_PAYMENT_STATUS,
} from "@/lib/order-metrics";
import { orderStatusIs, orderStatusNotIn } from "@/lib/order-status-sql";
import type {
  AdminAnalyticsActivityItem,
  AdminAnalyticsBucket,
  AdminAnalyticsPeriod,
  AdminAnalyticsPeriodSummary,
  AdminAnalyticsResponse,
  AdminAnalyticsSummary,
} from "@/lib/admin-analytics-types";

const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY_ANALYTICS_SUMMARY = {
  pageViews: 0,
  uniqueVisitors: 0,
  signups: 0,
  orders: 0,
  convertedVisitors: 0,
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekStartKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return dayKey(d);
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function periodStart(period: AdminAnalyticsPeriod): Date {
  if (period === "daily") {
    return utcMidnight(new Date(Date.now() - 13 * DAY_MS));
  }

  const currentWeekStart = new Date(`${weekStartKey(new Date())}T00:00:00.000Z`);
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7 * 7);
  return currentWeekStart;
}

function periodKeys(period: AdminAnalyticsPeriod): string[] {
  const keys: string[] = [];

  if (period === "daily") {
    for (let i = 13; i >= 0; i--) {
      keys.push(dayKey(new Date(Date.now() - i * DAY_MS)));
    }
    return keys;
  }

  const start = new Date(`${weekStartKey(new Date())}T00:00:00.000Z`);
  for (let i = 7; i >= 0; i--) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() - i * 7);
    keys.push(dayKey(date));
  }
  return keys;
}

async function safeAnalytics<T>(
  fallback: T,
  loader: () => Promise<T>
): Promise<{ ok: boolean; value: T }> {
  try {
    return { ok: true, value: await loader() };
  } catch (error) {
    const { code = "" } = extractDbErrorInfo(error);
    if (code !== "42P01") {
      console.warn(
        "[admin-analytics] analytics query failed:",
        formatErrorForLog(error, { includeStack: false })
      );
    }
    return { ok: false, value: fallback };
  }
}

interface AnalyticsSeriesRow {
  key: string;
  pageViews: number;
  uniqueVisitors: number;
  convertedVisitors: number;
}

interface AnalyticsPeriodTotals {
  pageViews: number;
  uniqueVisitors: number;
  convertedVisitors: number;
}

async function loadAnalyticsSeries(
  period: AdminAnalyticsPeriod,
  since: Date
): Promise<AnalyticsSeriesRow[]> {
  const dateExpr =
    period === "daily"
      ? sql`TO_CHAR(${analyticsEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
      : sql`TO_CHAR(DATE_TRUNC('week', ${analyticsEvents.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

  return db
    .select({
      key: sql<string>`${dateExpr}`,
      pageViews: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      convertedVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} IN ('SIGNUP', 'ORDER_CREATED'))::int`,
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(dateExpr);
}

async function loadAnalyticsPeriodTotals(
  since: Date
): Promise<AnalyticsPeriodTotals> {
  const [row] = await db
    .select({
      pageViews: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      convertedVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} IN ('SIGNUP', 'ORDER_CREATED'))::int`,
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since));

  return {
    pageViews: Number(row?.pageViews ?? 0),
    uniqueVisitors: Number(row?.uniqueVisitors ?? 0),
    convertedVisitors: Number(row?.convertedVisitors ?? 0),
  };
}

async function loadAnalyticsSummary(): Promise<{
  pageViews: number;
  uniqueVisitors: number;
  signups: number;
  orders: number;
  convertedVisitors: number;
}> {
  const [row] = await db
    .select({
      pageViews: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} = 'PAGE_VIEW')::int`,
      signups: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'SIGNUP')::int`,
      orders: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'ORDER_CREATED')::int`,
      convertedVisitors: sql<number>`COUNT(DISTINCT ${analyticsEvents.visitorId}) FILTER (WHERE ${analyticsEvents.eventType} IN ('SIGNUP', 'ORDER_CREATED'))::int`,
    })
    .from(analyticsEvents);

  return {
    pageViews: Number(row?.pageViews ?? 0),
    uniqueVisitors: Number(row?.uniqueVisitors ?? 0),
    signups: Number(row?.signups ?? 0),
    orders: Number(row?.orders ?? 0),
    convertedVisitors: Number(row?.convertedVisitors ?? 0),
  };
}

function conversionRate(convertedVisitors: number, uniqueVisitors: number): number {
  if (uniqueVisitors <= 0) return 0;
  return Number(((convertedVisitors / uniqueVisitors) * 100).toFixed(2));
}

export async function getAdminAnalytics(
  period: AdminAnalyticsPeriod
): Promise<AdminAnalyticsResponse> {
  const since = periodStart(period);
  const keys = periodKeys(period);

  const dateExprFor = (column: SQLWrapper) =>
    period === "daily"
      ? sql`TO_CHAR(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
      : sql`TO_CHAR(DATE_TRUNC('week', ${column} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

  const userDateExpr = dateExprFor(users.createdAt);
  const orderDateExpr = dateExprFor(orders.createdAt);

  const revenueCurrencyExpr = sql`COALESCE(NULLIF(TRIM(${stores.currency}), ''), 'UNKNOWN')`;

  const [
    userStatsRows,
    orderCountRows,
    revenueRows,
    analyticsSummaryResult,
    analyticsPeriodResult,
    analyticsSeriesResult,
    userSeriesRows,
    orderSeriesRows,
    recentPageViewsResult,
    recentUsers,
    recentOrders,
  ] = await Promise.all([
    db
      .select({
        totalUsers: sql<number>`COUNT(*)::int`,
        usersLast7Days: sql<number>`COUNT(*) FILTER (WHERE ${users.createdAt} >= NOW() - INTERVAL '7 days')::int`,
      })
      .from(users),
    db
      .select({ value: sql<number>`COUNT(*)::int` })
      .from(orders)
      .where(orderStatusNotIn(orders.status, ["CANCELLED"])),
    db
      .select({
        currency: sql<string>`${revenueCurrencyExpr}`,
        orders: sql<number>`COUNT(*)::int`,
        amount: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)::text`,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(
        and(
          orderStatusIs(orders.status, REVENUE_ORDER_STATUS),
          sql`LOWER(${orders.paymentStatus}) = ${REVENUE_PAYMENT_STATUS}`
        )
      )
      .groupBy(revenueCurrencyExpr)
      .orderBy(desc(sql`SUM(${orders.totalAmount})`)),
    safeAnalytics(EMPTY_ANALYTICS_SUMMARY, loadAnalyticsSummary),
    safeAnalytics<AnalyticsPeriodTotals>(
      { pageViews: 0, uniqueVisitors: 0, convertedVisitors: 0 },
      () => loadAnalyticsPeriodTotals(since)
    ),
    safeAnalytics<AnalyticsSeriesRow[]>([], () =>
      loadAnalyticsSeries(period, since)
    ),
    db
      .select({
        key: sql<string>`${userDateExpr}`,
        signups: sql<number>`COUNT(*)::int`,
      })
      .from(users)
      .where(gte(users.createdAt, since))
      .groupBy(userDateExpr),
    db
      .select({
        key: sql<string>`${orderDateExpr}`,
        orders: sql<number>`COUNT(*)::int`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, since),
          orderStatusNotIn(orders.status, ["CANCELLED"])
        )
      )
      .groupBy(orderDateExpr),
    safeAnalytics(
      [] as Array<{ id: string; path: string; createdAt: Date }>,
      () =>
        db
          .select({
            id: analyticsEvents.id,
            path: analyticsEvents.path,
            createdAt: analyticsEvents.createdAt,
          })
          .from(analyticsEvents)
          .orderBy(desc(analyticsEvents.createdAt))
          .limit(8)
    ),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(6),
    db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        status: orders.status,
        storeName: stores.name,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .orderBy(desc(orders.createdAt))
      .limit(6),
  ]);

  const userStats = userStatsRows[0] ?? { totalUsers: 0, usersLast7Days: 0 };
  const totalOrders = Number(orderCountRows[0]?.value ?? 0);
  const analyticsSummary = analyticsSummaryResult.value;
  const analyticsPeriod = analyticsPeriodResult.value;
  const trackingAvailable =
    analyticsSummaryResult.ok || analyticsPeriodResult.ok;

  const analyticsSeriesMap = new Map(
    analyticsSeriesResult.value.map((row) => [row.key, row])
  );
  const userSeriesMap = new Map(userSeriesRows.map((row) => [row.key, row.signups]));
  const orderSeriesMap = new Map(orderSeriesRows.map((row) => [row.key, row.orders]));

  const series: AdminAnalyticsBucket[] = keys.map((key) => {
    const analytics = analyticsSeriesMap.get(key);
    const signups = Number(userSeriesMap.get(key) ?? 0);
    const orderCount = Number(orderSeriesMap.get(key) ?? 0);
    const convertedVisitors = Number(analytics?.convertedVisitors ?? 0);
    const uniqueVisitors = Number(analytics?.uniqueVisitors ?? 0);

    return {
      key,
      label: key,
      pageViews: Number(analytics?.pageViews ?? 0),
      uniqueVisitors,
      signups,
      orders: orderCount,
      convertedVisitors,
      conversionRate: conversionRate(convertedVisitors, uniqueVisitors),
    };
  });

  const periodSignups = series.reduce((sum, bucket) => sum + bucket.signups, 0);
  const periodOrders = series.reduce((sum, bucket) => sum + bucket.orders, 0);

  const periodSummary: AdminAnalyticsPeriodSummary = {
    uniqueVisitors: analyticsPeriod.uniqueVisitors,
    pageViews: analyticsPeriod.pageViews,
    signups: periodSignups,
    orders: periodOrders,
    convertedVisitors: analyticsPeriod.convertedVisitors,
    conversionRate: conversionRate(
      analyticsPeriod.convertedVisitors,
      analyticsPeriod.uniqueVisitors
    ),
  };

  const summary: AdminAnalyticsSummary = {
    uniqueVisitors: analyticsSummary.uniqueVisitors,
    pageViews: analyticsSummary.pageViews,
    totalUsers: Number(userStats.totalUsers ?? 0),
    usersLast7Days: Number(userStats.usersLast7Days ?? 0),
    totalOrders,
    revenueByCurrency: revenueRows.map((row) => ({
      currency: row.currency,
      amount: row.amount,
      orders: Number(row.orders ?? 0),
    })),
    signups: analyticsSummary.signups,
    orders: analyticsSummary.orders,
    convertedVisitors: analyticsSummary.convertedVisitors,
    conversionRate: conversionRate(
      analyticsSummary.convertedVisitors,
      analyticsSummary.uniqueVisitors
    ),
  };

  const recentActivity: AdminAnalyticsActivityItem[] = [
    ...recentPageViewsResult.value.map((event) => ({
      id: `page-view-${event.id}`,
      type: "PAGE_VIEW" as const,
      title: "Page view",
      detail: event.path || "/",
      createdAt: event.createdAt.toISOString(),
    })),
    ...recentUsers.map((user) => ({
      id: `registration-${user.id}`,
      type: "REGISTRATION" as const,
      title: "New registration",
      detail: user.name ? `${user.name} · ${user.email}` : user.email,
      createdAt: user.createdAt.toISOString(),
    })),
    ...recentOrders.map((order) => ({
      id: `order-${order.id}`,
      type: "ORDER" as const,
      title: "New order",
      detail: `${order.storeName} · ${order.totalAmount} · ${order.status}`,
      createdAt: order.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    period,
    trackingAvailable,
    summary,
    periodSummary,
    series,
    recentActivity,
  };
}

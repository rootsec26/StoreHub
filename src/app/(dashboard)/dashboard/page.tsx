"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  DollarSign,
  Package,
  Clock,
  TrendingUp,
  Plus,
  MessageSquareCode,
  BarChart3,
  ArrowRight,
  Heart,
  User,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import StatusBadge from "@/components/StatusBadge";
import StatCard from "@/components/ui/StatCard";
import Badge, { statusTone } from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import type { NotificationDTO } from "@/lib/messaging/types";

interface RecentOrder {
  id: string;
  customerName: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

interface DashboardStats {
  todayOrders: number;
  todaySales: string;
  totalProducts: number;
  pendingOrders: number;
  recentOrders: RecentOrder[];
}

interface RecentFollower {
  id: string;
  label: string;
  isRegistered: boolean;
  createdAt: string;
}

interface FollowersData {
  count: number;
  recentFollowers: RecentFollower[];
}

export default function DashboardPage() {
  const { t, formatMoney, formatNumber, formatDate } = useI18n();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<NotificationDTO[]>([]);
  const [followers, setFollowers] = useState<FollowersData | null>(null);
  const [loading, setLoading] = useState(true);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);
  const pendingCount = useOrdersRealtime((state) => state.pendingCount);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const [statsRes, campaignsRes, followersRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/notifications?limit=3", { cache: "no-store" }).catch(
            () => null
          ),
          fetch("/api/dashboard/followers", { cache: "no-store" }).catch(
            () => null
          ),
        ]);
        const statsData = await statsRes.json();

        let campaigns: NotificationDTO[] = [];
        if (campaignsRes?.ok) {
          const campaignData = (await campaignsRes.json()) as {
            campaigns?: NotificationDTO[];
          };
          campaigns = campaignData.campaigns ?? [];
        }

        let followerData: FollowersData | null = null;
        if (followersRes?.ok) {
          followerData = (await followersRes.json()) as FollowersData;
        }

        if (cancelled) return;

        setStats({
          todayOrders: statsData.todayOrders ?? 0,
          todaySales: statsData.todaySales ?? "0",
          totalProducts: statsData.totalProducts ?? 0,
          pendingOrders: statsData.pendingOrders ?? 0,
          recentOrders: statsData.recentOrders ?? [],
        });
        setRecentCampaigns(campaigns);
        setFollowers(followerData);
      } catch (error) {
        console.error("Failed to load stats:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
  }, [lastEvent]);

  const quickActions = [
    {
      href: "/dashboard/products",
      label: t("home.addProduct"),
      icon: Plus,
    },
    {
      href: "/dashboard/orders",
      label: t("home.viewOrders"),
      icon: ShoppingCart,
    },
    {
      href: "/dashboard/notifications",
      label: t("home.sendMessage"),
      icon: MessageSquareCode,
    },
    {
      href: "/dashboard/analytics",
      label: t("home.viewAnalytics"),
      icon: BarChart3,
    },
  ];

  const metricCards = stats
    ? [
        {
          label: t("home.todayOrders"),
          value: formatNumber(stats.todayOrders),
          icon: ShoppingCart,
          tone: "indigo" as const,
        },
        {
          label: t("home.todaySales"),
          value: formatMoney(stats.todaySales),
          icon: DollarSign,
          tone: "emerald" as const,
        },
        {
          label: t("home.totalProducts"),
          value: formatNumber(stats.totalProducts),
          icon: Package,
          tone: "amber" as const,
        },
        {
          label: t("home.pendingOrders"),
          value: formatNumber(pendingCount || stats.pendingOrders),
          icon: Clock,
          tone: "rose" as const,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Greeting + quick actions */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-7">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("home.greeting")}
        </h1>
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">
            {t("home.quickActions")}
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/20"
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-16" />
              </div>
            ))
          : metricCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                tone={card.tone}
              />
            ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              {t("home.recentOrders")}
            </h2>
            <TrendingUp className="h-5 w-5 text-slate-400" />
          </div>
          {loading ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : stats?.recentOrders.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {t("home.noOrders")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3 text-start">{t("table.customer")}</th>
                    <th className="px-5 py-3 text-start">{t("table.amount")}</th>
                    <th className="px-5 py-3 text-start">{t("table.status")}</th>
                    <th className="px-5 py-3 text-start">{t("table.date")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats?.recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm font-medium text-slate-900">
                        {order.customerName}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatMoney(order.totalAmount)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent messages */}
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              {t("home.recentMessages")}
            </h2>
            <Link
              href="/dashboard/notifications"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t("common.all")}
              <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : recentCampaigns.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {t("home.noMessages")}
              <div className="mt-3">
                <Link
                  href="/dashboard/notifications"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {t("home.sendMessage")}
                </Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentCampaigns.map((campaign) => (
                <li key={campaign.id}>
                  <Link
                    href={`/dashboard/notifications?campaign=${campaign.id}`}
                    className="block px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium text-slate-900">
                        {campaign.title}
                      </p>
                      <Badge tone={statusTone(campaign.status)}>
                        {t(
                          `messages.status.${campaign.status}` as TranslationKey
                        )}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {campaign.body}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {formatNumber(campaign.deliveredCount)} /{" "}
                      {formatNumber(campaign.recipientCount)}
                      {" · "}
                      {formatDate(campaign.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Followers */}
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              {t("home.followers")}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
              <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
              {formatNumber(followers?.count ?? 0)}
            </span>
          </div>
          {loading ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : !followers || followers.recentFollowers.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {t("home.noFollowers")}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {followers.recentFollowers.map((follower) => (
                <li
                  key={follower.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <User className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {follower.isRegistered
                        ? follower.label
                        : `${t("home.followerAnonymous")} ${follower.label}`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(follower.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

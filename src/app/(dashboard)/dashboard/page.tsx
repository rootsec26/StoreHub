"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  DollarSign,
  Package,
  Clock,
  TrendingUp,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";
import StatusBadge from "@/components/StatusBadge";

interface RecentOrder {
  id: string;
  customerName: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

interface DashboardStats {
  todayOrders: number;
  todaySales: number;
  totalProducts: number;
  pendingOrders: number;
  recentOrders: RecentOrder[];
}

export default function DashboardPage() {
  const { t, formatMoney, formatNumber, formatDate } = useI18n();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const lastEvent = useOrdersRealtime((state) => state.lastEvent);
  const pendingCount = useOrdersRealtime((state) => state.pendingCount);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const [ordersRes, productsRes] = await Promise.all([
          fetch("/api/orders"),
          fetch("/api/products"),
        ]);

        const ordersData = await ordersRes.json();
        const productsData = await productsRes.json();

        const allOrders: RecentOrder[] = ordersData.orders || [];
        const allProducts = productsData.products || [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayOrders = allOrders.filter(
          (o) => new Date(o.createdAt) >= today
        );

        const todaySales = todayOrders.reduce(
          (sum, o) => sum + parseFloat(o.totalAmount || "0"),
          0
        );

        const pendingOrders = allOrders.filter(
          (o) => o.status === "Pending"
        ).length;

        if (cancelled) return;

        setStats({
          todayOrders: todayOrders.length,
          todaySales,
          totalProducts: allProducts.length,
          pendingOrders,
          recentOrders: allOrders.slice(0, 5),
        });
      } catch (error) {
        console.error("Failed to load stats:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
  }, [lastEvent]);

  const metricCards = stats
    ? [
        {
          label: t("home.todayOrders"),
          value: formatNumber(stats.todayOrders),
          icon: ShoppingCart,
          bgColor: "bg-indigo-50",
          textColor: "text-indigo-600",
        },
        {
          label: t("home.todaySales"),
          value: formatMoney(stats.todaySales),
          icon: DollarSign,
          bgColor: "bg-emerald-50",
          textColor: "text-emerald-600",
        },
        {
          label: t("home.totalProducts"),
          value: formatNumber(stats.totalProducts),
          icon: Package,
          bgColor: "bg-amber-50",
          textColor: "text-amber-600",
        },
        {
          label: t("home.pendingOrders"),
          value: formatNumber(pendingCount || stats.pendingOrders),
          icon: Clock,
          bgColor: "bg-rose-50",
          textColor: "text-rose-600",
        },
      ]
    : [];

  return (
    <div>
      {/* Metric Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-8 w-16 rounded bg-slate-200" />
              </div>
            ))
          : metricCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    {card.label}
                  </p>
                  <div className={`rounded-lg ${card.bgColor} p-2`}>
                    <card.icon className={`h-4 w-4 ${card.textColor}`} />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {card.value}
                </p>
              </div>
            ))}
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {t("home.recentOrders")}
          </h3>
          <TrendingUp className="h-5 w-5 text-slate-400" />
        </div>
        {loading ? (
          <div className="p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="mb-4 flex animate-pulse items-center gap-4"
              >
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="h-4 w-20 rounded bg-slate-200" />
                <div className="h-4 w-16 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : stats?.recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            {t("home.noOrders")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3 text-start">{t("table.customer")}</th>
                  <th className="px-6 py-3 text-start">{t("table.amount")}</th>
                  <th className="px-6 py-3 text-start">{t("table.status")}</th>
                  <th className="px-6 py-3 text-start">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats?.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {order.customerName}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatMoney(order.totalAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  ShoppingCart,
  Truck,
  Users,
  BarChart3,
  Megaphone,
  Zap,
  ShieldAlert,
  CreditCard,
  Settings,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";

export const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/dashboard/products", labelKey: "nav.products", icon: Package },
  { href: "/dashboard/categories", labelKey: "nav.categories", icon: FolderOpen },
  { href: "/dashboard/orders", labelKey: "nav.orders", icon: ShoppingCart },
  { href: "/dashboard/shipping", labelKey: "nav.shipping", icon: Truck },
  { href: "/dashboard/customers", labelKey: "nav.customers", icon: Users },
  { href: "/dashboard/analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { href: "/dashboard/marketing", labelKey: "nav.marketing", icon: Megaphone },
  {
    href: "/dashboard/promotions",
    labelKey: "nav.promotions",
    icon: Zap,
    badge: "hot",
  },
  { href: "/dashboard/ai-radar", labelKey: "nav.aiRadar", icon: ShieldAlert },
  { href: "/dashboard/billing", labelKey: "nav.billing", icon: CreditCard },
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
] as const;

interface SidebarNavProps {
  pendingOrders: number;
  onNavigate?: () => void;
}

/**
 * Dashboard sidebar links (rendered by the dashboard layout).
 * The promotions link carries a pulsing badge: the number of campaigns that
 * are live right now, or a "HOT" chip while none are running.
 */
export default function SidebarNav({
  pendingOrders,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [activePromotions, setActivePromotions] = useState<number | null>(null);
  const [unfulfilledOrders, setUnfulfilledOrders] = useState<number | null>(null);
  const lastEvent = useOrdersRealtime((state) => state.lastEvent);

  // Refresh whenever the merchant moves between pages so a campaign launched
  // from the promotions dashboard updates the badge immediately.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/promotions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { activeCount?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.activeCount === "number") {
          setActivePromotions(data.activeCount);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Live "orders pending fulfillment" counter for the Shipping & Labels link.
  // Re-runs on navigation and on every realtime order change.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/shipping?summary=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unfulfilledCount?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.unfulfilledCount === "number") {
          setUnfulfilledOrders(data.unfulfilledCount);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname, lastEvent]);

  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const showOrdersBadge =
          item.href === "/dashboard/orders" && pendingOrders > 0;
        const showShippingBadge =
          item.href === "/dashboard/shipping" &&
          unfulfilledOrders !== null &&
          unfulfilledOrders > 0;
        const showPromotionsBadge = "badge" in item && item.badge === "hot";
        const liveCampaigns =
          activePromotions !== null && activePromotions > 0
            ? activePromotions
            : null;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{t(item.labelKey)}</span>
              {showOrdersBadge && (
                <span
                  className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  aria-label={`${pendingOrders} ${t("nav.orders")}`}
                >
                  {pendingOrders > 99 ? "99+" : pendingOrders}
                </span>
              )}
              {showShippingBadge && (
                <span
                  className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-950"
                  aria-label={t("shipping.badge.pending", {
                    count: unfulfilledOrders ?? 0,
                  })}
                >
                  {(unfulfilledOrders ?? 0) > 99 ? "99+" : unfulfilledOrders}
                </span>
              )}
              {showPromotionsBadge && (
                <span
                  className={`ms-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                    liveCampaigns !== null
                      ? "bg-amber-500 text-slate-950"
                      : "animate-pulse bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40"
                  }`}
                  aria-label={
                    liveCampaigns !== null
                      ? `${liveCampaigns} ${t("nav.promotions")}`
                      : t("promos.badge.hot")
                  }
                >
                  {liveCampaigns !== null ? liveCampaigns : "HOT"}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

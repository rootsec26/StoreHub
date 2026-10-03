"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  PackageCheck,
  FolderOpen,
  ShoppingCart,
  Calculator,
  Truck,
  Users,
  BarChart3,
  Megaphone,
  Zap,
  ShieldAlert,
  CreditCard,
  Settings,
  MessageSquareCode,
  Award,
  Warehouse,
  Bot,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useOrdersRealtime } from "@/lib/realtime";

/**
 * Single "home" entry — rendered once at the top of the sidebar and kept out
 * of NAV_ITEMS so it can never appear twice.
 */
export const HOME_NAV_ITEM = { href: "/", labelKey: "nav.home", icon: Home } as const;

export const NAV_ITEMS = [
  { href: "/dashboard/products", labelKey: "nav.products", icon: Package },
  { href: "/dashboard/categories", labelKey: "nav.categories", icon: FolderOpen },
  { href: "/dashboard/orders", labelKey: "nav.orders", icon: ShoppingCart },
  {
    href: "/dashboard/pos",
    labelKey: "nav.pos",
    icon: Calculator,
    statusDot: true,
  },
  { href: "/dashboard/shipping", labelKey: "nav.shipping", icon: Truck },
  {
    href: "/dashboard/shipping-labels",
    labelKey: "nav.shippingLabels",
    icon: PackageCheck,
  },
  {
    href: "/dashboard/warehouses",
    labelKey: "nav.warehouses",
    icon: Warehouse,
  },
  {
    href: "/dashboard/abandoned-carts",
    labelKey: "nav.abandonedCarts",
    icon: MessageSquareCode,
  },
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
  { href: "/dashboard/ai-radar/social-bot", labelKey: "nav.socialBot", icon: Bot },
  { href: "/dashboard/billing", labelKey: "nav.billing", icon: CreditCard },
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
  {
    href: "/dashboard/loyalty",
    labelKey: "nav.loyalty",
    icon: Award,
    badge: (pathname: string) => {
      // We'll handle the badge count separately - showing "members" as an example
      // The actual count will be fetched from the API summary endpoint
      return null; // Badge will be set via the summary API
    },
  },
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
  const [pendingAbandonedCarts, setPendingAbandonedCarts] = useState<number | null>(null);
  const [activeLoyaltyMembers, setActiveLoyaltyMembers] = useState<number | null>(null);
  const [activeWarehouses, setActiveWarehouses] = useState<number | null>(null);
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

  // Unrecovered ("pending") carts badge for the Abandoned Carts link.
  // Refreshes on navigation and whenever an order lands (recovery signal).
  useEffect(() => {
    let cancelled = false;

    fetch("/api/abandoned-carts?summary=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          summary?: { activePendingCarts?: number };
        } | null) => {
          if (cancelled || !data?.summary) return;
          if (typeof data.summary.activePendingCarts === "number") {
            setPendingAbandonedCarts(data.summary.activePendingCarts);
          }
        }
      )
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname, lastEvent]);

  // Active loyalty program members badge for the Loyalty & VIP Program link.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/loyalty?summary=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { members?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.members === "number") {
          setActiveLoyaltyMembers(data.members);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Active warehouse count badge for the Warehouses & Branches link.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/warehouses?summary=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { activeCount?: number } | null) => {
        if (cancelled || !data) return;
        if (typeof data.activeCount === "number") {
          setActiveWarehouses(data.activeCount);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // The deepest matching entry wins so nested pages (e.g.
  // /dashboard/ai-radar/social-bot) light up themselves — not their parent
  // and not a sibling with a shared prefix (shipping vs shipping-labels).
  const activeHref = NAV_ITEMS.reduce<string | null>((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) return best;
    if (!best || item.href.length > best.length) return item.href;
    return best;
  }, null);

  return (
    <ul className="space-y-1">
      <li>
        <Link
          href={HOME_NAV_ITEM.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname === HOME_NAV_ITEM.href
              ? "bg-indigo-600 text-white"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <HOME_NAV_ITEM.icon className="h-5 w-5" />
          <span>{t(HOME_NAV_ITEM.labelKey)}</span>
        </Link>
      </li>
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === activeHref;
        const showOrdersBadge =
          item.href === "/dashboard/orders" && pendingOrders > 0;
        const showShippingBadge =
          (item.href === "/dashboard/shipping" ||
            item.href === "/dashboard/shipping-labels") &&
          unfulfilledOrders !== null &&
          unfulfilledOrders > 0;
        const showAbandonedBadge =
          item.href === "/dashboard/abandoned-carts" &&
          pendingAbandonedCarts !== null &&
          pendingAbandonedCarts > 0;
        const showPromotionsBadge = "badge" in item && item.badge === "hot";
        const liveCampaigns =
          activePromotions !== null && activePromotions > 0
            ? activePromotions
            : null;

        const showLoyaltyBadge =
          item.href === "/dashboard/loyalty" && activeLoyaltyMembers !== null;

        const showWarehouseBadge =
          item.href === "/dashboard/warehouses" &&
          activeWarehouses !== null &&
          activeWarehouses > 0;

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
              {"statusDot" in item && item.statusDot && (
                <span
                  className="ms-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
                  title={t("pos.status.ready")}
                  role="img"
                  aria-label={t("pos.status.ready")}
                />
              )}
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
              {showAbandonedBadge && (
                <span
                  className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  aria-label={`${pendingAbandonedCarts} ${t("nav.abandonedCarts")}`}
                >
                  {(pendingAbandonedCarts ?? 0) > 99
                    ? "99+"
                    : pendingAbandonedCarts}
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
              {showLoyaltyBadge && (
                <span
                  className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                  aria-label={t("loyalty.sidebarMembers", {
                    count: activeLoyaltyMembers,
                  })}
                >
                  {activeLoyaltyMembers > 99 ? "99+" : activeLoyaltyMembers}
                </span>
              )}
              {showWarehouseBadge && (
                <span
                  className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-bold leading-none text-sky-300 ring-1 ring-inset ring-sky-400/40"
                  aria-label={t("warehouse.sidebarActive", {
                    count: activeWarehouses ?? 0,
                  })}
                  title={t("warehouse.sidebarActive", {
                    count: activeWarehouses ?? 0,
                  })}
                >
                  {(activeWarehouses ?? 0) > 99 ? "99+" : activeWarehouses}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

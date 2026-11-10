"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  ShoppingBag,
  Store,
  Users,
  Megaphone,
  MessageSquareCode,
  Ticket,
  Star,
  BadgeCheck,
  MonitorSmartphone,
  Rss,
} from "lucide-react";

import { cn } from "@/components/ui/cn";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/merchants", label: "Merchants", icon: Store },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/customers", label: "Customers", icon: ShoppingBag },
  { href: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/admin/banner", label: "Site banner", icon: MonitorSmartphone },
  { href: "/admin/feed", label: "Platform feed", icon: Rss },
  { href: "/admin/messages", label: "Messages", icon: MessageSquareCode },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/codes", label: "Activation codes", icon: Ticket },
  { href: "/admin/reviews", label: "Store reviews", icon: Star },
  { href: "/admin/verification", label: "Verification", icon: BadgeCheck },
] as const;

/** Deepest matching entry wins so nested admin pages highlight correctly. */
function activeHref(pathname: string): string | null {
  return ADMIN_NAV.reduce<string | null>((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) return best;
    if (!best || item.href.length > best.length) return item.href;
    return best;
  }, null);
}

export default function AdminNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
      {ADMIN_NAV.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

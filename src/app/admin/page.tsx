import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import {
  Activity,
  ArrowRight,
  BellRing,
  Heart,
  Megaphone,
  MessageSquareCode,
  ShoppingBag,
  Store,
  Ticket,
  UserPlus,
  Users,
} from "lucide-react";

import { db } from "@/db";
import { activationCodes, storeFollowers, stores } from "@/db/schema";
import { isAdminAuthorized } from "@/lib/admin";
import { getAdminOverview } from "@/lib/messaging/service";
import AdminAnalyticsDashboard from "./AnalyticsDashboard";

export const runtime = "nodejs";

async function getCodeStats() {
  try {
    const codes = await db
      .select()
      .from(activationCodes)
      .orderBy(desc(activationCodes.createdAt));

    return {
      total: codes.length,
      available: codes.filter(
        (code) =>
          !code.isUsed &&
          (!code.expiresAt || new Date(code.expiresAt).getTime() > Date.now())
      ).length,
      used: codes.filter((code) => code.isUsed).length,
    };
  } catch (error) {
    console.error("Failed to load activation code stats:", error);
    return { total: 0, available: 0, used: 0 };
  }
}

async function getFollowerStats() {
  try {
    const [totals, boostTotals, topStores] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeFollowers),
      db
        .select({
          count: sql<number>`coalesce(sum(${stores.followerBoost}), 0)::int`,
        })
        .from(stores),
      db
        .select({
          storeId: storeFollowers.storeId,
          storeName: stores.name,
          storeSlug: stores.slug,
          followerBoost: stores.followerBoost,
          followers: sql<number>`count(*)::int`,
        })
        .from(storeFollowers)
        .innerJoin(stores, eq(storeFollowers.storeId, stores.id))
        .groupBy(
          storeFollowers.storeId,
          stores.name,
          stores.slug,
          stores.followerBoost
        )
        .orderBy(sql`count(*) desc`)
        .limit(5),
    ]);

    return {
      total: (totals[0]?.count ?? 0) + (boostTotals[0]?.count ?? 0),
      topStores: topStores.map((store) => ({
        ...store,
        followers: store.followers + Math.max(0, store.followerBoost ?? 0),
      })),
    };
  } catch (error) {
    console.error("Failed to load follower stats:", error);
    return { total: 0, topStores: [] };
  }
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Users;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-colors hover:border-indigo-200"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {value.toLocaleString("en-US")}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const allowed = await isAdminAuthorized();
  if (!allowed) return <AdminOnly />;

  const [overview, codes, followers] = await Promise.all([
    getAdminOverview().catch((error) => {
      console.error("Failed to load admin overview:", error);
      return {
        totalMerchants: 0,
        totalStores: 0,
        newUsersLast7Days: 0,
        broadcastsLast7Days: 0,
        messagesLast7Days: 0,
        unreadBroadcasts: 0,
      };
    }),
    getCodeStats(),
    getFollowerStats(),
  ]);

  const sections = [
    {
      href: "/admin/merchants",
      title: "Merchants",
      description: "Stores, plans and product counts.",
      icon: Store,
    },
    {
      href: "/admin/users",
      title: "Users",
      description: "All accounts with a Recent-7-days tab.",
      icon: Users,
    },
    {
      href: "/admin/customers",
      title: "Store customers",
      description: "Buyers, contact details and purchase history.",
      icon: ShoppingBag,
    },
    {
      href: "/admin/broadcasts",
      title: "Broadcasts",
      description: "Send in-app announcements to store owners.",
      icon: Megaphone,
    },
    {
      href: "/admin/messages",
      title: "Merchant messages",
      description: "Campaigns and delivery logs with masked contacts.",
      icon: MessageSquareCode,
    },
    {
      href: "/admin/activity",
      title: "Activity log",
      description: "Audit feed for stores, users, products, orders and messages.",
      icon: Activity,
    },
    {
      href: "/admin/codes",
      title: "Activation codes",
      description: "Generate and track plan / credit vouchers.",
      icon: Ticket,
    },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Overview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform health at a glance. Counts cover the last 7 days where noted.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total merchants"
          value={overview.totalMerchants}
          hint={`${overview.totalStores.toLocaleString("en-US")} stores`}
          icon={Store}
          href="/admin/merchants"
        />
        <StatCard
          label="New users (7 days)"
          value={overview.newUsersLast7Days}
          icon={UserPlus}
          href="/admin/users?tab=recent"
        />
        <StatCard
          label="Unread broadcasts"
          value={overview.unreadBroadcasts}
          hint="Merchant inbox rows not opened yet"
          icon={BellRing}
          href="/admin/broadcasts"
        />
        <StatCard
          label="Broadcasts sent (7 days)"
          value={overview.broadcastsLast7Days}
          icon={Megaphone}
          href="/admin/broadcasts"
        />
        <StatCard
          label="Merchant messages (7 days)"
          value={overview.messagesLast7Days}
          icon={MessageSquareCode}
          href="/admin/messages"
        />
        <StatCard
          label="Store followers"
          value={followers.total}
          hint={`${followers.topStores.length.toLocaleString("en-US")} stores have followers`}
          icon={Heart}
          href="/admin/merchants"
        />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-500">
              Activation codes
            </p>
            <span className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <Ticket className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {codes.available.toLocaleString("en-US")}
            <span className="ms-1 text-sm font-medium text-slate-500">
              available
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {codes.used.toLocaleString("en-US")} used ·{" "}
            {codes.total.toLocaleString("en-US")} generated
          </p>
        </div>
      </section>

      {followers.topStores.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Top followed stores
            </h2>
            <Heart className="h-5 w-5 text-rose-400" />
          </div>
          <ul className="divide-y divide-slate-100">
            {followers.topStores.map((store) => (
              <li
                key={store.storeId}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {store.storeName}
                  </p>
                  <p className="text-xs text-slate-400">/{store.storeSlug}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
                  <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
                  {store.followers.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdminAnalyticsDashboard />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-colors hover:border-indigo-200"
          >
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600">
              <section.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {section.title}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {section.description}
              </span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function AdminOnly() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-lg text-slate-500">
          Admin panel is only accessible on localhost
        </p>
      </div>
    </div>
  );
}

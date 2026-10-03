"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Store,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Volume2,
  VolumeX,
  Bell,
  BellRing,
} from "lucide-react";

import SidebarNav, { NAV_ITEMS } from "@/components/dashboard/Sidebar";
import LanguageSwitcher from "@/components/LanguageSwitcher";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useOrdersRealtime, type RealtimeStatus } from "@/lib/realtime";
import {
  getDesktopNotificationPermission,
  getDesktopPermissionServerSnapshot,
  getDesktopPermissionSnapshot,
  requestDesktopNotificationPermission,
  showDesktopNotification,
  subscribeDesktopPermission,
} from "@/lib/notifications";
import {
  getNotificationMutedSnapshot,
  getNotificationMutedServerSnapshot,
  playOrderChime,
  primeNotificationSound,
  setNotificationMuted,
  subscribeNotificationMuted,
} from "@/lib/sound";

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
}

function LiveStatusPill({ status }: { status: RealtimeStatus }) {
  const { t } = useI18n();
  if (status === "idle") return null;

  const styles: Record<Exclude<RealtimeStatus, "idle">, { dot: string; text: string; label: TranslationKey }> = {
    live: { dot: "bg-emerald-400", text: "text-emerald-300", label: "orders.live" },
    connecting: { dot: "bg-amber-400 animate-pulse", text: "text-amber-300", label: "orders.connecting" },
    polling: { dot: "bg-sky-400 animate-pulse", text: "text-sky-300", label: "orders.polling" },
  };

  const style = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2 py-1 text-[11px] font-medium ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {t(style.label)}
    </span>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const desktopPermission = useSyncExternalStore(
    subscribeDesktopPermission,
    getDesktopPermissionSnapshot,
    getDesktopPermissionServerSnapshot
  );

  const muted = useSyncExternalStore(
    subscribeNotificationMuted,
    getNotificationMutedSnapshot,
    getNotificationMutedServerSnapshot
  );

  const pendingCount = useOrdersRealtime((state) => state.pendingCount);
  const realtimeStatus = useOrdersRealtime((state) => state.status);
  const newPendingOrder = useOrdersRealtime((state) => state.newPendingOrder);
  const consumeNewPendingOrder = useOrdersRealtime(
    (state) => state.consumeNewPendingOrder
  );

  const playedOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    primeNotificationSound();
  }, []);

  async function toggleDesktopNotifications() {
    if (desktopPermission === "unsupported") {
      setToast(t("notifications.unsupported"));
      return;
    }
    if (desktopPermission === "denied") {
      setToast(t("notifications.blocked"));
      return;
    }

    const permission = await requestDesktopNotificationPermission();
    setToast(
      permission === "granted"
        ? t("notifications.enabled")
        : t("notifications.blocked")
    );
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { store?: StoreInfo | null } | null) => {
        if (!cancelled && data?.store?.id) setStore(data.store);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to realtime `orders` changes scoped to this tenant's store.
  useEffect(() => {
    if (!store?.id) return;
    const realtime = useOrdersRealtime.getState();
    realtime.connect(store.id);

    return () => {
      useOrdersRealtime.getState().disconnect();
    };
  }, [store?.id]);

  // Clear playedOrderIds when store changes to prevent memory growth
  useEffect(() => {
    if (!store?.id) return;
    playedOrderIds.current.clear();
  }, [store?.id]);

  // Chime + toast whenever a brand new Pending order lands.
  useEffect(() => {
    if (!newPendingOrder) return;

    if (playedOrderIds.current.has(newPendingOrder.id)) {
      consumeNewPendingOrder();
      return;
    }

    playedOrderIds.current.add(newPendingOrder.id);
    // Bound the set size to prevent memory growth over long sessions
    if (playedOrderIds.current.size > 500) {
      const ids = Array.from(playedOrderIds.current);
      playedOrderIds.current = new Set(ids.slice(-250));
    }
    playOrderChime();

    // OS-level desktop popup whenever a new order lands in realtime.
    if (!muted) {
      const order = newPendingOrder;
      void (async () => {
        const current = getDesktopNotificationPermission();
        if (current === "unsupported") return;

        const permission =
          current === "default"
            ? await requestDesktopNotificationPermission()
            : current;

        if (permission === "granted") {
          showDesktopNotification({
            title: t("orders.newOrderTitle"),
            body: t("orders.newOrderToast", { name: order.customerName }),
            tag: order.id,
          });
        }
      })();
    }

    setToast(
      t("orders.newOrderToast", { name: newPendingOrder.customerName })
    );
    consumeNewPendingOrder();
  }, [newPendingOrder, consumeNewPendingOrder, t, muted]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function toggleMute() {
    setNotificationMuted(!muted);
  }

  // Deepest matching section wins (e.g. AI Radar vs AI Radar → Social Bot).
  // Falls back to the dashboard title when no section matches (e.g. /dashboard).
  const activeItem = NAV_ITEMS.reduce<(typeof NAV_ITEMS)[number] | null>(
    (best, item) => {
      const matches =
        pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (!matches) return best;
      if (!best || item.href.length > best.href.length) return item;
      return best;
    },
    null
  );
  const activeLabelKey: TranslationKey =
    activeItem?.labelKey ?? "nav.dashboard";

  const desktopNotificationLabelKey: TranslationKey =
    desktopPermission === "granted"
      ? "notifications.enabled"
      : desktopPermission === "unsupported"
        ? "notifications.unsupported"
        : desktopPermission === "denied"
          ? "notifications.blocked"
          : "notifications.enable";

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        } lg:rtl:translate-x-0`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <Store className="h-6 w-6 text-indigo-400" />
            <span className="text-lg font-bold text-white">StoreHub</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white lg:hidden"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {store && (
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-sm font-medium text-white">{store.name}</p>
            <Link
              href={`/store/${store.slug}`}
              target="_blank"
              className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              /store/{store.slug}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        <nav className="flex-1 px-3 py-4">
          <SidebarNav
            pendingOrders={pendingCount}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>

        <div className="space-y-3 border-t border-slate-800 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <LiveStatusPill status={realtimeStatus} />
            <button
              onClick={toggleMute}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              title={muted ? t("common.unmute") : t("common.mute")}
              aria-label={muted ? t("common.unmute") : t("common.mute")}
              aria-pressed={muted}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900 lg:hidden"
            aria-label={t("common.close")}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="flex-1 text-lg font-semibold text-slate-900">
            {t(activeLabelKey)}
          </h2>

          <button
            onClick={toggleDesktopNotifications}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            title={t(desktopNotificationLabelKey)}
            aria-label={t(desktopNotificationLabelKey)}
            aria-pressed={desktopPermission === "granted"}
          >
            {desktopPermission === "granted" ? (
              <BellRing className="h-4 w-4 text-emerald-500" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {desktopPermission === "granted"
                ? t("notifications.enabled")
                : t("notifications.enable")}
            </span>
          </button>

          <LanguageSwitcher />
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* New order toast */}
      {toast && (
        <div className="fixed end-4 top-4 z-[60] flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

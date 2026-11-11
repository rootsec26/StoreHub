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
  Copy,
  Check,
} from "lucide-react";

import SidebarNav, { NAV_ITEMS } from "@/components/dashboard/Sidebar";
import { getSiteUrl } from "@/lib/site";
import { isTauriDesktopApp, openStoreWindow } from "@/lib/platform";
import NotificationBell from "@/components/dashboard/NotificationBell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProductMenu from "@/components/products/ProductMenu";

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
  const [linkCopied, setLinkCopied] = useState(false);

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

  const origin = useSyncExternalStore(
    () => () => {},
    () => getSiteUrl(),
    () => ""
  );
  const storeUrl = store ? `${origin}/store/${store.slug}` : "";

  // Inside the Tauri desktop shell, target="_blank" is a no-op — open the
  // storefront in a dedicated app window (or the OS browser as fallback).
  function handleStoreLinkClick(e: React.MouseEvent) {
    if (!isTauriDesktopApp() || !store || !storeUrl) return;
    e.preventDefault();
    void openStoreWindow(
      storeUrl,
      `store-${store.slug}`,
      `StoreHub — ${store.name}`
    );
  }

  async function copyStoreLink() {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
    } catch {
      const el = document.createElement("textarea");
      el.value = storeUrl;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setLinkCopied(true);
    setToast(t("orders.cod.linkCopied"));
    setTimeout(() => setLinkCopied(false), 2000);
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
              onClick={handleStoreLinkClick}
              target="_blank"
              className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              /store/{store.slug}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900 lg:hidden"
            aria-label={t("common.close")}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="flex-1 truncate text-lg font-semibold text-slate-900">
            {t(activeLabelKey)}
          </h2>

          {store && (
            <div className="hidden items-center gap-1 rounded-lg border border-indigo-500/30 bg-slate-900 px-2.5 py-1.5 shadow-sm md:flex">
              <Link
                href={`/store/${store.slug}`}
                onClick={handleStoreLinkClick}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[200px] truncate text-xs font-semibold text-white transition-colors hover:text-indigo-300 lg:max-w-[280px]"
                title={storeUrl}
                dir="ltr"
              >
                {storeUrl.replace(/^https?:\/\//, "")}
              </Link>
              <button
                onClick={copyStoreLink}
                className="rounded p-1 text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-white"
                title={t("orders.cod.copyLink")}
                aria-label={t("orders.cod.copyLink")}
              >
                {linkCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <Link
                href={`/store/${store.slug}`}
                onClick={handleStoreLinkClick}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-white"
                title={t("domain.visitStore")}
                aria-label={t("domain.visitStore")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <ProductMenu />

          <NotificationBell />

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

        {/* Mobile store link bar */}
        {store && (
          <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-2.5 md:hidden">
            <div className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-slate-900 px-3 py-2 shadow-sm">
              <Link
                href={`/store/${store.slug}`}
                onClick={handleStoreLinkClick}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-semibold text-white"
                title={storeUrl}
                dir="ltr"
              >
                {storeUrl.replace(/^https?:\/\//, "")}
              </Link>
              <button
                onClick={copyStoreLink}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25"
                title={t("orders.cod.copyLink")}
                aria-label={t("orders.cod.copyLink")}
              >
                {linkCopied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {linkCopied ? t("orders.cod.linkCopied") : t("orders.cod.copyLink")}
                </span>
              </button>
              <Link
                href={`/store/${store.slug}`}
                onClick={handleStoreLinkClick}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-400"
                title={t("domain.visitStore")}
                aria-label={t("domain.visitStore")}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">{t("domain.visitStore")}</span>
              </Link>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
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

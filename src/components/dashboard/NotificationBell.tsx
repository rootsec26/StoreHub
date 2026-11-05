"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n";
import type { InboxItem, NotificationSummary } from "@/lib/messaging/types";

const POLL_INTERVAL_MS = 45_000;

/**
 * Header bell for the platform -> merchant inbox. Polls the summary endpoint
 * for the unread badge and lazily loads the latest five announcements when the
 * panel opens.
 */
export default function NotificationBell() {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/summary", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as NotificationSummary;
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Badge is best-effort; ignore transient failures.
    }
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/notifications/inbox?limit=5", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load inbox");
      const data = (await res.json()) as { items?: InboxItem[] };
      setItems(data.items ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadSummary();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [loadSummary]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInbox();
  }, [open, loadInbox]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(ids: string[], all = false) {
    const targetIds = all
      ? items.filter((item) => !item.readAt).map((item) => item.recipientId)
      : ids.filter((id) =>
          items.some((item) => item.recipientId === id && !item.readAt)
        );

    if (!all && targetIds.length === 0) return;

    // Optimistic update so the panel feels instant.
    const targetSet = new Set(targetIds);
    setItems((current) =>
      current.map((item) =>
        all || targetSet.has(item.recipientId)
          ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
          : item
      )
    );
    setUnreadCount((current) =>
      all ? 0 : Math.max(0, current - targetSet.size)
    );

    try {
      await fetch("/api/notifications/inbox/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { ids: targetIds }),
      });
      void loadSummary();
    } catch {
      void loadInbox();
      void loadSummary();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        title={t("messages.bell.title")}
        aria-label={t("messages.bell.title")}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("messages.bell.title")}
          className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("messages.bell.title")}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead([], true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("messages.inbox.markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {t("common.loading")}
              </p>
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-500">
                  {t("messages.bell.empty")}
                </p>
                <button
                  type="button"
                  onClick={() => void loadInbox()}
                  className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Inbox className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {t("messages.bell.empty")}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const unread = !item.readAt;
                  return (
                    <li key={item.recipientId}>
                      <button
                        type="button"
                        onClick={() => void markRead([item.recipientId])}
                        className={cn(
                          "flex w-full flex-col gap-1 px-4 py-3 text-start transition-colors hover:bg-slate-50",
                          unread && "bg-indigo-50/40"
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={cn(
                              "text-sm text-slate-900",
                              unread ? "font-semibold" : "font-medium"
                            )}
                          >
                            {item.title}
                          </span>
                          {unread && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                          )}
                        </span>
                        <span className="line-clamp-2 text-xs text-slate-500">
                          {item.body}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-center">
            <Link
              href="/dashboard/notifications?tab=inbox"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t("messages.bell.viewAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

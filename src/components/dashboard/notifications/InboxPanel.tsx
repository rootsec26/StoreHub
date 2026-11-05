"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/components/ui/cn";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { InboxItem, InboxResponse } from "@/lib/messaging/types";

/** Priorities that deserve a warmer tone in the list. */
function priorityTone(priority: InboxItem["priority"]) {
  switch (priority) {
    case "URGENT":
      return "rose" as const;
    case "HIGH":
      return "amber" as const;
    default:
      return "slate" as const;
  }
}

export default function InboxPanel({
  onUnreadChange,
}: {
  onUnreadChange?: (count: number) => void;
}) {
  const { t, formatDateTime } = useI18n();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (targetPage: number, mode: "all" | "unread") => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: "25",
        });
        if (mode === "unread") params.set("unreadOnly", "true");
        const res = await fetch(`/api/notifications/inbox?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("inbox");
        const data = (await res.json()) as InboxResponse;
        setItems(data.items ?? []);
        setUnreadCount(data.unreadCount ?? 0);
        setTotal(data.total ?? 0);
        setPageSize(data.pageSize ?? 25);
        onUnreadChange?.(data.unreadCount ?? 0);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [onUnreadChange]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page, filter);
  }, [page, filter, load]);

  async function markRead(ids: string[], all = false) {
    const targets = all
      ? items.filter((item) => !item.readAt).map((item) => item.recipientId)
      : ids.filter((id) =>
          items.some((item) => item.recipientId === id && !item.readAt)
        );
    if (!all && targets.length === 0) return;

    const targetSet = new Set(targets);
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
        body: JSON.stringify(all ? { all: true } : { ids: targets }),
      });
      void load(page, filter);
    } catch {
      void load(page, filter);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { id: "all", label: t("messages.inbox.all"), count: total },
            {
              id: "unread",
              label: t("messages.inbox.unread"),
              count: unreadCount,
            },
          ]}
          value={filter}
          onChange={(value) => {
            setFilter(value as "all" | "unread");
            setPage(1);
          }}
        />
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markRead([], true)}
          >
            <CheckCheck className="h-4 w-4" />
            {t("messages.inbox.markAllRead")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <p className="text-sm text-slate-500">{t("common.retry")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void load(page, filter)}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("messages.inbox.empty")}
          description={t("messages.subtitle")}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const unread = !item.readAt;
            return (
              <li key={item.recipientId}>
                <button
                  type="button"
                  onClick={() => void markRead([item.recipientId])}
                  className={cn(
                    "w-full rounded-xl border p-4 text-start shadow-sm transition-colors",
                    unread
                      ? "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      )}
                      <h3
                        className={cn(
                          "text-sm text-slate-900",
                          unread ? "font-semibold" : "font-medium"
                        )}
                      >
                        {item.title}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="slate">
                        {t(
                          `messages.category.${item.category}` as TranslationKey
                        )}
                      </Badge>
                      {item.priority !== "NORMAL" && (
                        <Badge tone={priorityTone(item.priority)}>
                          {t(
                            `messages.priority.${item.priority}` as TranslationKey
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {item.body}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
          </button>
          <span className="text-xs text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
            aria-label={t("common.viewDetails")}
          >
            <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        </div>
      )}
    </div>
  );
}

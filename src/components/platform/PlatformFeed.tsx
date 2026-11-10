"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Check,
  Megaphone,
  PartyPopper,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";

const FOLLOWER_ID_KEY = "storehub:follower-id";
const POLL_INTERVAL_MS = 45_000;
const MAX_POSTS = 20;

interface PlatformPost {
  id: string;
  authorName: string;
  content: string;
  category: string;
  linkUrl: string;
  createdAt: string;
}

interface FeedResponse {
  posts?: PlatformPost[];
  followerCount?: number;
  following?: boolean;
}

const CATEGORY_META: Record<
  string,
  { icon: typeof Sparkles; labelKey: TranslationKey; classes: string }
> = {
  UPDATE: {
    icon: RefreshCw,
    labelKey: "platform.cat.update",
    classes: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  ANNOUNCEMENT: {
    icon: Megaphone,
    labelKey: "platform.cat.announcement",
    classes: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  FEATURE: {
    icon: PartyPopper,
    labelKey: "platform.cat.feature",
    classes: "bg-violet-50 text-violet-700 ring-violet-200",
  },
};

function getOrCreateFollowerId(): string | null {
  try {
    const existing = window.localStorage.getItem(FOLLOWER_ID_KEY);
    if (existing) return existing;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(FOLLOWER_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Verified StoreHub platform feed. Super-admin posts surface here with the
 * official badge; merchants and shoppers can follow the feed. Refreshes by
 * polling so new posts appear without a manual reload.
 */
export default function PlatformFeed() {
  const { t, formatNumber, formatDate } = useI18n();

  const [posts, setPosts] = useState<PlatformPost[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const followerIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (followerIdRef.current) params.set("followerId", followerIdRef.current);
      const res = await fetch(`/api/platform/feed?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as FeedResponse;
      setPosts(Array.isArray(data.posts) ? data.posts.slice(0, MAX_POSTS) : []);
      if (typeof data.followerCount === "number") {
        setCount(data.followerCount);
      }
      setFollowing(Boolean(data.following));
    } catch {
      // Transient failure — keep the last rendered state.
    }
  }, []);

  useEffect(() => {
    followerIdRef.current = getOrCreateFollowerId();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const toggleFollow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(false);

    const nextFollowing = !following;
    const previousCount = count ?? 0;
    setFollowing(nextFollowing);
    setCount(Math.max(0, previousCount + (nextFollowing ? 1 : -1)));

    try {
      const res = await fetch("/api/platform/follow", {
        method: nextFollowing ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          followerIdRef.current ? { followerId: followerIdRef.current } : {}
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        count?: number;
        following?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (typeof data.count === "number") setCount(data.count);
      setFollowing(Boolean(data.following));
    } catch {
      setFollowing(!nextFollowing);
      setCount(previousCount);
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [busy, following, count]);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Bell className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold text-slate-900">
                {t("platform.title")}
              </h2>
              <BadgeCheck
                className="h-4.5 w-4.5 text-sky-500"
                aria-label={t("platform.verified")}
              />
            </div>
            <p className="text-[11px] font-medium text-slate-400">
              {t("platform.official")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy || count === null}
          aria-pressed={following}
          title={error ? t("store.followError") : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
            following
              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200"
              : "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500"
          }`}
        >
          {following ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          {following ? t("store.following") : t("store.follow")}
          {count !== null && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                following ? "bg-emerald-200/70 text-emerald-800" : "bg-white/20"
              }`}
            >
              {formatNumber(count)}
            </span>
          )}
        </button>
      </div>

      {posts === null ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {t("platform.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {posts.map((post) => {
            const meta = CATEGORY_META[post.category] ?? CATEGORY_META.UPDATE;
            const CategoryIcon = meta.icon;
            return (
              <li key={post.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.classes}`}
                  >
                    <CategoryIcon className="h-3 w-3" />
                    {t(meta.labelKey)}
                  </span>
                  <time className="shrink-0 text-[11px] text-slate-400">
                    {formatDate(post.createdAt)}
                  </time>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {post.content}
                </p>
                {post.linkUrl &&
                  (post.linkUrl.startsWith("/") ? (
                    <Link
                      href={post.linkUrl}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {t("platform.learnMore")}
                    </Link>
                  ) : (
                    <a
                      href={post.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {t("platform.learnMore")}
                    </a>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

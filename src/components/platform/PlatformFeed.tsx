"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  Megaphone,
  PartyPopper,
  RefreshCw,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  FOLLOW_SYNC_EVENT,
  buildFollowLoginUrl,
} from "@/lib/follow-action";

const FOLLOWER_ID_KEY = "storehub:follower-id";
const POLL_INTERVAL_MS = 45_000;
const MAX_POSTS = 50;

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
  count?: number;
  following?: boolean;
}

const CATEGORY_META: Record<
  string,
  { icon: typeof Megaphone; labelKey: TranslationKey; classes: string }
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
 * Official StoreHub platform channel.
 *
 * `compact` (landing page): a sleek card with branding, verified badge,
 * follower count and a CTA to /feed — no raw post list.
 * Default (`/feed` page): the same card plus the full updates timeline.
 */
export default function PlatformFeed({ compact = false }: { compact?: boolean }) {
  const { t, formatNumber, formatDate } = useI18n();

  const [posts, setPosts] = useState<PlatformPost[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const followerIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (followerIdRef.current) params.set("followerId", followerIdRef.current);
      // Compact mode only needs follow state — skip the posts payload.
      const endpoint = compact
        ? `/api/platform/follow?${params.toString()}`
        : `/api/platform/feed?${params.toString()}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as FeedResponse;
      if (!compact && Array.isArray(data.posts)) {
        setPosts(data.posts.slice(0, MAX_POSTS));
      }
      const nextCount = data.followerCount ?? data.count;
      if (typeof nextCount === "number") setCount(nextCount);
      setFollowing(Boolean(data.following));
    } catch {
      // Transient failure — keep the last rendered state.
    }
  }, [compact]);

  useEffect(() => {
    followerIdRef.current = getOrCreateFollowerId();

    // Auth probe: logged-out visitors are routed through Google sign-in
    // before they can follow; the deferred action completes on return.
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { user?: unknown } | null;
      })
      .then((data) => setAuthed(Boolean(data?.user)))
      .catch(() => setAuthed(false));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // A deferred follow completed after sign-in — refresh follow state.
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener(FOLLOW_SYNC_EVENT, handler);
    return () => window.removeEventListener(FOLLOW_SYNC_EVENT, handler);
  }, [load]);

  const toggleFollow = useCallback(async () => {
    if (busy) return;
    if (authed === false) {
      window.location.assign(buildFollowLoginUrl({ action: "follow_platform" }));
      return;
    }
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
  }, [busy, following, count, authed]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
      {/* Official channel header */}
      <div className="relative border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60 px-5 py-5">
        <div className="pointer-events-none absolute -end-10 -top-10 h-28 w-28 rounded-full bg-indigo-200/30 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25 ring-1 ring-slate-900/10">
              <Image
                src="/logo-transparent.png"
                alt="StoreHub"
                fill
                sizes="48px"
                className="object-contain p-1.5"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="truncate text-lg font-extrabold tracking-tight text-slate-900">
                  StoreHub
                </h2>
                <BadgeCheck
                  className="h-6 w-6 shrink-0 text-sky-500 drop-shadow-[0_2px_6px_rgba(14,165,233,0.55)]"
                  strokeWidth={2.4}
                  aria-label={t("platform.verified")}
                />
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-700 ring-1 ring-sky-200">
                  {t("platform.verifiedBadge")}
                </span>
                <span className="hidden rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-200 sm:inline">
                  {t("platform.title")}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                {t("platform.official")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFollow}
            disabled={busy || count === null || authed === null}
            aria-pressed={following}
            title={error ? t("store.followError") : undefined}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
              following
                ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-200"
                : "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-500"
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
      </div>

      {compact ? (
        /* Compact CTA — keeps the landing page clean */
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-xs font-medium text-slate-500">
            {t("platform.official")}
          </p>
          <Link
            href="/feed"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-700"
          >
            {t("platform.viewAll")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      ) : posts === null ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
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

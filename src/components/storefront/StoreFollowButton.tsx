"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, Plus } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const FOLLOWER_ID_KEY = "storehub:follower-id";
const OWNER_NOTICE_MS = 2600;

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

interface StoreFollowButtonProps {
  slug: string;
}

/**
 * Follow/unfollow toggle for the storefront header. Anonymous shoppers are
 * identified by a UUID kept in localStorage; signed-in users are resolved
 * server-side from their session, so the local id is ignored for them.
 *
 * When the viewer owns this store the button renders as a muted "Your Store"
 * badge — clicking it shows a friendly notice instead of following. The API
 * independently rejects self-follows with a 403 OWN_STORE_FOLLOW error.
 */
export default function StoreFollowButton({ slug }: StoreFollowButtonProps) {
  const { t, formatNumber } = useI18n();

  const [count, setCount] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showOwnerNotice, setShowOwnerNotice] = useState(false);
  const followerIdRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    followerIdRef.current = getOrCreateFollowerId();

    let cancelled = false;

    // Owner detection: /api/auth/me returns the signed-in user's store slug.
    // Anonymous visitors get a 401 and simply stay in follower mode.
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          store?: { slug?: string } | null;
        } | null;
      })
      .then((data) => {
        if (!cancelled && data?.store?.slug === slug) setIsOwner(true);
      })
      .catch(() => {});

    const params = new URLSearchParams({ slug });
    if (followerIdRef.current) {
      params.set("followerId", followerIdRef.current);
    }

    fetch(`/api/storefront/followers?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          count?: number;
          following?: boolean;
        };
        if (cancelled) return;
        setCount(typeof data.count === "number" ? data.count : 0);
        setFollowing(Boolean(data.following));
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    return () => {
      cancelled = true;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [slug]);

  const toggle = useCallback(async () => {
    if (busy || isOwner) return;
    setBusy(true);
    setError(false);

    const nextFollowing = !following;
    const previousCount = count ?? 0;
    // Optimistic update — the server response carries the authoritative count.
    setFollowing(nextFollowing);
    setCount(Math.max(0, previousCount + (nextFollowing ? 1 : -1)));

    try {
      const res = await fetch("/api/storefront/followers", {
        method: nextFollowing ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          ...(followerIdRef.current
            ? { followerId: followerIdRef.current }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        count?: number;
        following?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Request failed");
      setCount(typeof data.count === "number" ? data.count : previousCount);
      setFollowing(Boolean(data.following));
    } catch {
      setFollowing(!nextFollowing);
      setCount(previousCount);
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [busy, following, count, slug, isOwner]);

  const handleOwnerClick = useCallback(() => {
    setShowOwnerNotice(true);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(
      () => setShowOwnerNotice(false),
      OWNER_NOTICE_MS
    );
  }, []);

  if (isOwner) {
    return (
      <div className="relative inline-flex animate-storefront-fade-up">
        {showOwnerNotice && (
          <span
            role="status"
            className="absolute -top-10 start-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg rtl:translate-x-1/2"
          >
            {t("store.ownStoreFollow")}
            <span className="absolute -bottom-1 start-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900 rtl:translate-x-1/2" />
          </span>
        )}
        <button
          type="button"
          onClick={handleOwnerClick}
          aria-disabled="true"
          title={t("store.ownStoreFollow")}
          className="inline-flex cursor-default items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/70 backdrop-blur transition-colors hover:bg-white/15"
        >
          <BadgeCheck className="h-4 w-4 text-emerald-300" />
          {t("store.yourStore")}
          {count !== null && count > 0 && (
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold text-white/80">
              {formatNumber(count)}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || count === null}
      aria-pressed={following}
      title={error ? t("store.followError") : undefined}
      className={`group relative inline-flex animate-storefront-fade-up items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-lg transition-all duration-300 active:scale-95 ${
        following
          ? "bg-emerald-400 text-emerald-950 shadow-emerald-950/30 hover:bg-emerald-300"
          : "bg-[var(--color-primary)] text-white shadow-black/30 ring-2 ring-white/40 hover:brightness-110 hover:shadow-[0_0_24px_var(--color-primary)]"
      }`}
      style={{ animationDelay: "240ms" }}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
          following
            ? "bg-emerald-950/15"
            : "bg-white/20 group-hover:bg-white/30"
        }`}
      >
        {following ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        )}
      </span>
      <span className="transition-all duration-300">
        {following ? t("store.following") : t("store.follow")}
      </span>
      {count !== null && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold transition-colors duration-300 ${
            following
              ? "bg-emerald-950/15 text-emerald-950"
              : "bg-white/20 text-white"
          }`}
        >
          {formatNumber(count)}
        </span>
      )}
    </button>
  );
}

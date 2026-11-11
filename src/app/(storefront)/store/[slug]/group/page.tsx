"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Clock, Loader2, Lock, Store, Users } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const FOLLOWER_ID_KEY = "storehub:follower-id";

type Membership = "none" | "pending" | "approved" | "rejected";

interface GroupPost {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface GroupData {
  group: {
    id: string;
    title: string;
    description: string;
    storeName: string;
    storeSlug: string;
  } | null;
  membership?: Membership;
  posts?: GroupPost[];
}

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
 * Public store-group page: shoppers request to join; approved members read
 * the merchant's announcements.
 */
export default function StoreGroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, formatDate, formatNumber } = useI18n();

  const [data, setData] = useState<GroupData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const followerIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ slug });
      if (followerIdRef.current) params.set("followerId", followerIdRef.current);
      const res = await fetch(`/api/storefront/group?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) setData((await res.json()) as GroupData);
    } finally {
      setLoaded(true);
    }
  }, [slug]);

  useEffect(() => {
    followerIdRef.current = getOrCreateFollowerId();
    void load();
  }, [load]);

  async function requestJoin() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/storefront/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          followerId: followerIdRef.current,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        membership?: Membership;
      };
      if (res.ok && json.membership) {
        setData((prev) =>
          prev ? { ...prev, membership: json.membership } : prev
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  const group = data?.group ?? null;
  const membership = data?.membership ?? "none";
  const posts = data?.posts ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/store/${slug}`}
        className="group mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        {group?.storeName ?? slug}
      </Link>

      {!group ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">{t("group.notFound")}</p>
        </div>
      ) : (
        <>
          {/* Group card */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60 px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
                  <Store className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-extrabold text-slate-900">
                    {group.title || group.storeName}
                  </h1>
                  <p className="text-xs font-medium text-slate-500">
                    {group.storeName}
                  </p>
                </div>
              </div>
              {group.description && (
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {group.description}
                </p>
              )}
            </div>

            <div className="px-5 py-4">
              {membership === "approved" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <Users className="h-3.5 w-3.5" />
                  {t("group.memberBadge")}
                </span>
              ) : membership === "pending" ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    <Clock className="h-3.5 w-3.5" />
                    {t("group.pendingReview")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void requestJoin()}
                    disabled={busy}
                    className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                  >
                    {t("group.resend")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestJoin()}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("group.join")}
                </button>
              )}
            </div>
          </section>

          {/* Posts — approved members only */}
          {membership === "approved" && (
            <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-bold text-slate-900">
                  {t("group.posts")}
                </h2>
              </div>
              {posts.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  {t("group.emptyPosts")}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {posts.map((post) => (
                    <li key={post.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-600">
                          {post.authorName}
                        </span>
                        <time className="text-[11px] text-slate-400">
                          {formatDate(post.createdAt)}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {post.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {membership !== "approved" && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" />
              {membership === "pending"
                ? t("group.pendingHint")
                : t("group.lockedHint")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

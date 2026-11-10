"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Megaphone,
  PartyPopper,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";

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
}

const CATEGORIES = [
  { value: "UPDATE", label: "Update", icon: RefreshCw },
  { value: "ANNOUNCEMENT", label: "Announcement", icon: Megaphone },
  { value: "FEATURE", label: "New feature", icon: PartyPopper },
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedManager() {
  const [posts, setPosts] = useState<PlatformPost[] | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("UPDATE");
  const [linkUrl, setLinkUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/feed", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as FeedResponse;
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      if (typeof data.followerCount === "number") {
        setFollowerCount(data.followerCount);
      }
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function publish() {
    const trimmed = content.trim();
    if (!trimmed || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          category,
          linkUrl: linkUrl.trim() || "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to publish");
      setContent("");
      setLinkUrl("");
      setToast("Post published to the platform feed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/feed/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
      setToast("Post deleted");
    } catch {
      setToast("Failed to delete post");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            Platform feed
            <BadgeCheck className="h-6 w-6 text-sky-500" />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publish updates, announcements and features to the verified
            StoreHub feed that merchants and shoppers can follow.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
          <Users className="h-4 w-4 text-slate-500" />
          {followerCount === null ? "—" : followerCount.toLocaleString()}{" "}
          followers
        </span>
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          New post
        </h2>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share an update, announcement or new feature…"
          rows={4}
          maxLength={2000}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                  category === cat.value
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                <cat.icon className="h-3.5 w-3.5" />
                {cat.label}
              </button>
            ))}
          </div>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Link URL (optional)"
            className="min-w-56 flex-1"
          />
          <Button
            onClick={publish}
            disabled={publishing || !content.trim()}
          >
            <Plus className="h-4 w-4" />
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Posts */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Published posts</h2>
        </div>
        {posts === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            description="Publish your first update to the platform feed."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {posts.map((post) => {
              const cat =
                CATEGORIES.find((c) => c.value === post.category) ??
                CATEGORIES[0];
              return (
                <li key={post.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="indigo">{cat.label}</Badge>
                      <span className="text-[11px] text-slate-400">
                        {formatDate(post.createdAt)}
                      </span>
                      {post.linkUrl && (
                        <a
                          href={post.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-indigo-600 hover:underline"
                        >
                          {post.linkUrl}
                        </a>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">
                      {post.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(post.id)}
                    disabled={busyId === post.id}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="Delete post"
                    aria-label="Delete post"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {toast && (
        <div className="fixed end-4 top-4 z-[60] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

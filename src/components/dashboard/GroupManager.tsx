"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Megaphone,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface GroupInfo {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

interface GroupStats {
  posts: number;
  pendingMembers: number;
  members: number;
}

interface GroupPost {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface Member {
  id: string;
  label: string;
  status: string;
  isRegistered: boolean;
  createdAt: string;
}

type MemberTab = "pending" | "approved";

/**
 * Merchant dashboard for the store group: settings, announcements and
 * member join-request approvals.
 */
export default function GroupManager() {
  const { t, formatDate, formatNumber } = useI18n();

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [posts, setPosts] = useState<GroupPost[] | null>(null);
  const [newPost, setNewPost] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [memberTab, setMemberTab] = useState<MemberTab>("pending");
  const [busyMember, setBusyMember] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/group", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        group?: GroupInfo | null;
        stats?: GroupStats | null;
      };
      const g = data.group ?? null;
      setGroup(g);
      setStats(data.stats ?? null);
      if (g) {
        setTitle(g.title);
        setDescription(g.description);
        // Posts + members only exist once a group does.
        const [postsRes, membersRes] = await Promise.all([
          fetch("/api/dashboard/group/posts", { cache: "no-store" }),
          fetch("/api/dashboard/group/members?status=all", {
            cache: "no-store",
          }),
        ]);
        if (postsRes.ok) {
          const pd = (await postsRes.json()) as { posts?: GroupPost[] };
          setPosts(Array.isArray(pd.posts) ? pd.posts : []);
        }
        if (membersRes.ok) {
          const md = (await membersRes.json()) as { members?: Member[] };
          setMembers(Array.isArray(md.members) ? md.members : []);
        }
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/dashboard/group", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      notify(t("group.saved"));
      await load();
    } catch {
      notify(t("store.followError"));
    } finally {
      setSaving(false);
    }
  }

  async function publishPost() {
    const content = newPost.trim();
    if (!content || publishing) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/dashboard/group/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      setNewPost("");
      await load();
    } catch {
      notify(t("store.followError"));
    } finally {
      setPublishing(false);
    }
  }

  async function deletePost(id: string) {
    try {
      const res = await fetch(`/api/dashboard/group/posts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setPosts((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch {
      notify(t("store.followError"));
    }
  }

  async function setMemberStatus(id: string, status: string) {
    if (busyMember) return;
    setBusyMember(id);
    try {
      const res = await fetch(`/api/dashboard/group/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      notify(t("store.followError"));
    } finally {
      setBusyMember(null);
    }
  }

  async function removeMember(id: string) {
    if (busyMember) return;
    setBusyMember(id);
    try {
      const res = await fetch(`/api/dashboard/group/members/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      notify(t("store.followError"));
    } finally {
      setBusyMember(null);
    }
  }

  const pendingMembers = (members ?? []).filter((m) => m.status === "pending");
  const approvedMembers = (members ?? []).filter((m) => m.status === "approved");
  const visibleMembers =
    memberTab === "pending" ? pendingMembers : approvedMembers;

  if (!loaded) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-6 w-6 text-indigo-500" />
            {t("group.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("group.subtitle")}</p>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              {formatNumber(stats.members)} {t("group.members")}
            </span>
            {stats.pendingMembers > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                {formatNumber(stats.pendingMembers)} {t("group.pending")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Group settings */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">
          {t("group.settings")}
        </h2>
        {group === null ? (
          <p className="mb-4 text-sm text-slate-500">{t("group.createHint")}</p>
        ) : null}
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("group.groupTitle")}
            maxLength={120}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("group.groupDesc")}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("group.save")}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {t("group.saved")}
              </span>
            )}
          </div>
        </div>
      </section>

      {group && (
        <>
          {/* New post composer */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <Megaphone className="h-4 w-4 text-indigo-500" />
              {t("group.newPost")}
            </h2>
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder={t("group.postPlaceholder")}
              maxLength={2000}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void publishPost()}
                disabled={publishing || !newPost.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("group.publish")}
              </button>
            </div>
          </section>

          {/* Posts */}
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">
                {t("group.posts")}
              </h2>
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
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                {t("group.emptyPosts")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {posts.map((post) => (
                  <li key={post.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-500">
                          {post.authorName}
                        </p>
                        <time className="text-[11px] text-slate-400">
                          {formatDate(post.createdAt)}
                        </time>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deletePost(post.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={t("common.close")}
                        title={t("group.remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {post.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Members */}
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserCheck className="h-4 w-4 text-indigo-500" />
                {t("group.members")}
              </h2>
              <div className="flex rounded-full bg-slate-100 p-1 text-xs font-bold">
                {(["pending", "approved"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMemberTab(tab)}
                    className={`rounded-full px-3 py-1 transition ${
                      memberTab === tab
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab === "pending" ? t("group.pending") : t("group.approved")}
                    {tab === "pending" && pendingMembers.length > 0 && (
                      <span className="ms-1 text-amber-600">
                        {formatNumber(pendingMembers.length)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {members === null ? (
              <div className="space-y-3 p-5">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : visibleMembers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                {memberTab === "pending" ? t("group.noRequests") : t("group.noMembers")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleMembers.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          member.isRegistered
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {member.isRegistered ? (
                          <UserCheck className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {member.label}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatDate(member.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {memberTab === "pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void setMemberStatus(member.id, "approved")}
                            disabled={busyMember === member.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            {t("group.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void setMemberStatus(member.id, "rejected")}
                            disabled={busyMember === member.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={3} />
                            {t("group.reject")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void removeMember(member.id)}
                          disabled={busyMember === member.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("group.remove")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {toast && (
        <div className="fixed end-4 top-4 z-[60] flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import Modal from "@/components/ui/Modal";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

interface TeamData {
  store: { id: string; name: string; slug: string };
  isOwner: boolean;
  currentUserId: string;
  owner: { userId: string; name: string; email: string; role: string } | null;
  members: Member[];
  invitations: Invitation[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TeamPage() {
  const { t } = useI18n();

  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/team")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || t("team.loadFailed"));
        }
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("team.loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteUrl(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setInviteError(t("team.invalidEmail"));
      return;
    }

    setInviteLoading(true);
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "ADMIN" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setInviteError(body?.error || t("team.inviteFailed"));
        return;
      }
      setInviteUrl(body.inviteUrl);
      setInviteEmail("");
      load();
    } catch {
      setInviteError(t("team.inviteFailed"));
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the URL is still visible for manual copy
    }
  }

  async function revokeInvitation(id: string) {
    const res = await fetch(`/api/team/invitations?id=${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function removeMember(member: Member) {
    if (!window.confirm(t("team.removeConfirm", { name: member.name }))) return;
    setRemovingId(member.userId);
    try {
      const res = await fetch(`/api/team/members/${member.userId}`, {
        method: "DELETE",
      });
      if (res.ok) load();
    } finally {
      setRemovingId(null);
    }
  }

  function roleLabel(role: string) {
    return role === "OWNER" ? t("team.roleOwner") : t("team.roleAdmin");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-white p-10 shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-white p-6 text-sm text-red-600 shadow-sm">
        {error || t("team.loadFailed")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Users className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("team.title")}</h2>
              <p className="text-sm text-slate-500">{t("team.subtitle")}</p>
            </div>
          </div>
          {data.isOwner && (
            <button
              type="button"
              onClick={() => {
                setInviteOpen(true);
                setInviteError(null);
                setInviteUrl(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <UserPlus className="h-4 w-4" />
              {t("team.addAdmin")}
            </button>
          )}
        </div>

        {/* Members */}
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start">{t("team.colMember")}</th>
                <th className="px-4 py-2.5 text-start">{t("team.colRole")}</th>
                <th className="px-4 py-2.5 text-start">{t("team.colJoined")}</th>
                {data.isOwner && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.owner && (
                <tr>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {data.owner.name}
                      {data.owner.userId === data.currentUserId && (
                        <span className="ms-2 text-xs text-slate-400">{t("team.you")}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500" dir="ltr">
                      {data.owner.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {roleLabel("OWNER")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">—</td>
                  {data.isOwner && <td className="px-4 py-3" />}
                </tr>
              )}
              {data.members.map((member) => (
                <tr key={member.userId}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {member.name}
                      {member.userId === data.currentUserId && (
                        <span className="ms-2 text-xs text-slate-400">{t("team.you")}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500" dir="ltr">
                      {member.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      {roleLabel(member.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  {data.isOwner && (
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => removeMember(member)}
                        disabled={removingId === member.userId}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {removingId === member.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {t("team.remove")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending invitations */}
      {data.isOwner && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-slate-400" />
            {t("team.invitations")}
          </h3>
          {data.invitations.length === 0 ? (
            <p className="text-sm text-slate-500">{t("team.pendingEmpty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.invitations.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900" dir="ltr">
                      {invite.email}
                    </div>
                    <div className="text-xs text-slate-500">
                      {roleLabel(invite.role)} · {t("team.expiresOn")}{" "}
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeInvitation(invite.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {t("team.revoke")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t("team.inviteTitle")}
        description={t("team.inviteHint")}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("common.close")}
            </button>
            <button
              type="submit"
              form="invite-form"
              disabled={inviteLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {inviteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("team.sendInvite")}
            </button>
          </>
        }
      >
        <form id="invite-form" onSubmit={sendInvite} className="space-y-4">
          {inviteError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {inviteError}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("team.inviteEmail")}
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              dir="ltr"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("team.inviteRole")}
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {roleLabel("ADMIN")}
            </div>
          </div>

          {inviteUrl && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="mb-2 text-xs font-medium text-emerald-800">
                {t("team.linkReady")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-slate-700" dir="ltr">
                  {inviteUrl}
                </code>
                <button
                  type="button"
                  onClick={copyInviteUrl}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("team.copied") : t("team.copyLink")}
                </button>
              </div>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}

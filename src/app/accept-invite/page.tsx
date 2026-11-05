"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserCheck,
  Loader2,
  LogIn,
  UserPlus,
  Store,
  AlertTriangle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface InviteInfo {
  email: string;
  role: string;
  storeName: string;
  storeSlug: string;
  status: string;
}

interface MeResponse {
  user?: { id: string; email: string; name: string };
}

function AcceptInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const token = searchParams.get("token") || "";
  const acceptPath = `/accept-invite?token=${encodeURIComponent(token)}`;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteError(t("invite.invalidLink"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    Promise.all([
      fetch(`/api/team/invite/${encodeURIComponent(token)}`)
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(body?.error || t("invite.loadFailed"));
          return body.invitation as InviteInfo;
        }),
      fetch("/api/auth/me")
        .then(async (res) => {
          if (!res.ok) return null;
          const body = (await res.json()) as MeResponse;
          return body.user?.email ?? null;
        })
        .catch(() => null),
    ])
      .then(([info, email]) => {
        if (cancelled) return;
        setInvite(info);
        setSessionEmail(email);
      })
      .catch((err) => {
        if (!cancelled) {
          setInviteError(err instanceof Error ? err.message : t("invite.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSessionChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const accept = useCallback(async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setAcceptError(body?.error || t("invite.acceptFailed"));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch {
      setAcceptError(t("invite.acceptFailed"));
    } finally {
      setAccepting(false);
    }
  }, [token, router, t]);

  const usable = invite?.status === "PENDING";
  const emailMismatch =
    !!invite && !!sessionEmail && sessionEmail.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
          {usable ? (
            <UserCheck className="h-7 w-7 text-indigo-600" />
          ) : (
            <AlertTriangle className="h-7 w-7 text-amber-500" />
          )}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{t("invite.title")}</h1>
        {invite && usable && (
          <p className="mt-2 text-sm text-slate-600">
            {t("invite.subtitle", { store: invite.storeName })}
          </p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        </div>
      )}

      {!loading && inviteError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{inviteError}</div>
      )}

      {!loading && !inviteError && invite && !usable && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          {invite.status === "EXPIRED" ? t("invite.expired") : t("invite.unavailable")}
        </div>
      )}

      {!loading && !inviteError && invite && usable && done && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          {t("invite.success")}
        </div>
      )}

      {!loading && !inviteError && invite && usable && !done && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <Store className="h-4 w-4 text-slate-400" />
              <span className="font-semibold">{invite.storeName}</span>
            </div>
            <div className="mt-2 text-slate-500" dir="ltr">
              {t("invite.sentTo", { email: invite.email })}
            </div>
          </div>

          {acceptError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {acceptError}
            </div>
          )}

          {sessionChecked && !sessionEmail && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t("invite.needAccount")}</p>
              <Link
                href={`/login?next=${encodeURIComponent(acceptPath)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <LogIn className="h-4 w-4" />
                {t("invite.signIn")}
              </Link>
              <Link
                href={`/signup?next=${encodeURIComponent(acceptPath)}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <UserPlus className="h-4 w-4" />
                {t("invite.signUp")}
              </Link>
            </div>
          )}

          {sessionChecked && sessionEmail && emailMismatch && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              {t("invite.wrongAccount", { email: invite.email })}
            </div>
          )}

          {sessionChecked && sessionEmail && !emailMismatch && (
            <button
              type="button"
              onClick={accept}
              disabled={accepting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {accepting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              {accepting ? t("invite.accepting") : t("invite.accept")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        }
      >
        <AcceptInviteInner />
      </Suspense>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

interface VerificationRequest {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  type: "free" | "paid" | string;
  status: "pending" | "approved" | "rejected" | string;
  paymentReference: string;
  paymentProof: string;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

interface StoreVerification {
  id: string;
  name: string;
  slug: string;
  isVerified: boolean;
  verificationType: string | null;
  verifiedAt: string | null;
  followerBoost: number;
  followerCount: number;
}

interface VerificationData {
  requests: VerificationRequest[];
  stores: StoreVerification[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      {status}
    </span>
  );
}

function TypeChip({ type }: { type: string }) {
  const paid = type === "paid";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        paid
          ? "bg-violet-100 text-violet-800 ring-violet-200"
          : "bg-sky-100 text-sky-800 ring-sky-200"
      }`}
    >
      <ShieldCheck className="h-3 w-3" />
      {paid ? "Paid · 700 EGP" : "Free · 10k followers"}
    </span>
  );
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function VerificationManager() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/verification", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load verification data");
      setData(await res.json());
      setError(null);
    } catch {
      setError("Failed to load verification data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(
    payload: Record<string, unknown>,
    busyKey: string
  ): Promise<Record<string, unknown> | null> {
    setBusyId(busyKey);
    setError(null);
    try {
      const res = await fetch("/api/admin/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Action failed");
        return null;
      }
      await load();
      return json;
    } catch {
      setError("Action failed");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function approveRequest(req: VerificationRequest) {
    await act({ action: "approve", requestId: req.id }, req.id);
  }

  async function revokeStore(store: StoreVerification) {
    if (
      !window.confirm(
        `Remove verification from "${store.name}"? The badge and follower boost will be revoked.`
      )
    ) {
      return;
    }
    await act({ action: "revoke", storeId: store.id }, store.id);
  }

  async function rejectRequest(req: VerificationRequest) {
    const adminNote = window.prompt("Rejection note (optional):", "");
    if (adminNote === null) return;
    await act(
      { action: "reject", requestId: req.id, adminNote },
      req.id
    );
  }

  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
  const history = (data?.requests ?? []).filter((r) => r.status !== "pending");
  const verifiedStores = (data?.stores ?? []).filter((s) => s.isVerified);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store Verification</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review توثيق المتجر requests, check Vodafone Cash proofs and
            approve stores for instant verification.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : (
        <>
          {/* Pending requests */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Pending requests
                {pending.length > 0 && (
                  <span className="ms-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-slate-950">
                    {pending.length}
                  </span>
                )}
              </h2>
            </div>
            {pending.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No pending verification requests.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((req) => (
                  <li key={req.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/store/${req.storeSlug}`}
                            target="_blank"
                            className="font-semibold text-slate-900 hover:text-indigo-600"
                          >
                            {req.storeName}
                          </Link>
                          <span className="text-xs text-slate-400" dir="ltr">
                            /store/{req.storeSlug}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                          <TypeChip type={req.type} />
                          <StatusChip status={req.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          Submitted {fmtDate(req.createdAt)}
                        </p>
                        {req.paymentReference && (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Payment ref:</span>{" "}
                            <span dir="ltr">{req.paymentReference}</span>
                          </p>
                        )}
                        {req.paymentProof && (
                          <a
                            href={req.paymentProof}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={req.paymentProof}
                              alt="Payment proof"
                              className="h-20 w-20 rounded-lg border border-slate-200 object-cover transition hover:opacity-80"
                            />
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => void approveRequest(req)}
                          disabled={busyId === req.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {busyId === req.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Approve &amp; verify
                        </button>
                        <button
                          onClick={() => void rejectRequest(req)}
                          disabled={busyId === req.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Verified stores */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Verified stores ({verifiedStores.length})
              </h2>
            </div>
            {verifiedStores.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No verified stores yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {verifiedStores.map((store) => (
                  <li
                    key={store.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BadgeCheck className="h-5 w-5 shrink-0 text-sky-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {store.name}
                        </p>
                        <p className="text-xs text-slate-500" dir="ltr">
                          /store/{store.slug} · {store.followerCount} followers ·{" "}
                          {store.verificationType ?? "manual"} · verified{" "}
                          {fmtDate(store.verifiedAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => void revokeStore(store)}
                      disabled={busyId === store.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busyId === store.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* History */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Reviewed requests
              </h2>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No reviewed requests yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {req.storeName}
                        </span>
                        <TypeChip type={req.type} />
                        <StatusChip status={req.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {fmtDate(req.createdAt)}
                        {req.reviewedAt && ` · reviewed ${fmtDate(req.reviewedAt)}`}
                        {req.adminNote && ` · ${req.adminNote}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

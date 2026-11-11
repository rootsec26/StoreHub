"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  X,
} from "lucide-react";

interface AdminRequest {
  id: string;
  userId: string;
  storeId: string | null;
  productKey: string;
  plan: string;
  amount: string;
  currency: string;
  method: string;
  referenceCode: string;
  senderPhone: string;
  transactionId: string;
  hasProof: boolean;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
  storeName: string | null;
  storeSlug: string | null;
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-500",
};

export default function PaymentRequestsManager() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [proof, setProof] = useState<{ id: string; url: string } | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantTarget, setGrantTarget] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [grantReason, setGrantReason] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payment-requests", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        requests?: AdminRequest[];
        error?: string;
      } | null;
      if (!res.ok || !json?.requests) {
        setError(json?.error ?? "Failed to load requests");
        return;
      }
      setRequests(json.requests);
      setError("");
    } catch {
      setError("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/payment-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "reject" ? { reason: rejectReason } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? "Review failed");
        return;
      }
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch {
      setError("Review failed");
    } finally {
      setBusyId(null);
    }
  }

  async function viewProof(id: string) {
    setProofLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/payment-requests/${id}/proof`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        proofData?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.proofData) {
        setError(json?.error ?? "No proof uploaded");
        return;
      }
      setProof({ id, url: json.proofData });
    } catch {
      setError("Failed to load proof");
    } finally {
      setProofLoading(false);
    }
  }

  async function submitGrant() {
    setGrantBusy(true);
    setGrantMsg("");
    setError("");
    try {
      const target = grantTarget.trim();
      const body: Record<string, unknown> = {
        days: Number(grantDays) || 30,
        reason: grantReason.trim(),
      };
      if (target.includes("@")) body.email = target;
      else body.storeSlug = target;
      const res = await fetch("/api/admin/payment-requests/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        currentPeriodEnd?: string;
      } | null;
      if (!res.ok) {
        setGrantMsg(json?.error ?? "Grant failed");
        return;
      }
      setGrantMsg(
        `Granted — active until ${json?.currentPeriodEnd ? new Date(json.currentPeriodEnd).toLocaleDateString() : "?"}`
      );
      setGrantTarget("");
      setGrantReason("");
      await load();
    } catch {
      setGrantMsg("Grant failed");
    } finally {
      setGrantBusy(false);
    }
  }

  const visible =
    filter === "pending"
      ? requests.filter((r) => r.status === "pending")
      : requests;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Payment requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manual Vodafone Cash subscription payments for StoreHub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              filter === "pending"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              filter === "all"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setGrantOpen((v) => !v)}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Grant manually
          </button>
        </div>
      </div>

      {grantOpen && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Manual grant</h2>
          <p className="mt-1 text-xs text-slate-500">
            Creates an approved manual_grant record (amount 0) and extends the
            subscription. Reason is required and stored on the audit row.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={grantTarget}
              onChange={(e) => setGrantTarget(e.target.value)}
              placeholder="User email or store slug"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <input
              type="number"
              min={1}
              max={366}
              value={grantDays}
              onChange={(e) => setGrantDays(e.target.value)}
              placeholder="Days"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <input
              type="text"
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              placeholder="Reason (required)"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          {grantMsg && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {grantMsg}
            </p>
          )}
          <button
            type="button"
            onClick={() => void submitGrant()}
            disabled={grantBusy || !grantTarget.trim() || !grantReason.trim()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {grantBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Grant subscription
          </button>
        </div>
      )}

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Verify the money actually arrived in the wallet before approving.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 ring-1 ring-slate-200">
          No {filter === "pending" ? "pending " : ""}payment requests.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-bold text-slate-900" dir="ltr">
                      {r.referenceCode}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CLS[r.status] ?? STATUS_CLS.pending}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {r.userName ?? r.userEmail ?? r.userId} ·{" "}
                    {r.userEmail} · store:{" "}
                    {r.storeName ?? r.storeSlug ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.reviewedAt
                      ? ` · reviewed ${new Date(r.reviewedAt).toLocaleString()} by ${r.reviewedBy ?? ""}`
                      : ""}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-extrabold text-slate-900">
                    {r.amount} {r.currency}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.plan} · {r.method}
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Sender phone
                  </dt>
                  <dd className="mt-0.5 font-mono" dir="ltr">
                    {r.senderPhone}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Transaction ID
                  </dt>
                  <dd className="mt-0.5 font-mono" dir="ltr">
                    {r.transactionId}
                  </dd>
                </div>
              </dl>

              {r.status === "rejected" && r.rejectReason && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                  Rejected: {r.rejectReason}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {r.hasProof && (
                  <button
                    type="button"
                    onClick={() => void viewProof(r.id)}
                    disabled={proofLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {proofLoading && proof?.id === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    View proof
                  </button>
                )}

                {r.status === "pending" &&
                  (rejectingId === r.id ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Rejection reason"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => void review(r.id, "reject")}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void review(r.id, "approve")}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(r.id)}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {proof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setProof(null)}
        >
          <div
            className="max-h-[90vh] max-w-3xl overflow-auto rounded-2xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proof.url}
              alt="Payment proof"
              className="max-h-[80vh] w-auto rounded-xl"
            />
            <button
              type="button"
              onClick={() => setProof(null)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              <Clock className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

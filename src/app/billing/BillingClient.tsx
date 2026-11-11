"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  AlertTriangle,
  Upload,
  XCircle,
  Wallet,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";

type RequestStatus = "pending" | "approved" | "rejected" | "expired";

interface PlanInfo {
  key: string;
  nameKey: TranslationKey;
  price: string;
  currency: string;
  durationDays: number;
}

interface PaymentRequest {
  id: string;
  plan: string;
  amount: string;
  currency: string;
  method: string;
  referenceCode: string;
  senderPhone: string;
  transactionId: string;
  hasProof: boolean;
  status: RequestStatus;
  rejectReason: string;
  createdAt: string;
  reviewedAt: string | null;
}

interface Instructions {
  method: string;
  account: string;
  accountName: string;
  notes: string;
}

interface Entitlement {
  status: "none" | "trial" | "active" | "expired";
  onboardingCompleted: boolean;
  currentPeriodEnd?: string | null;
}

interface BillingData {
  plans: PlanInfo[];
  methods: string[];
  instructions: Instructions[];
  requests: PaymentRequest[];
  entitlement: Entitlement | null;
  hasStore?: boolean;
}

const STATUS_STYLE: Record<RequestStatus, { key: TranslationKey; cls: string }> = {
  pending: { key: "billing.pending", cls: "bg-amber-100 text-amber-700" },
  approved: { key: "billing.approved", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { key: "billing.rejected", cls: "bg-red-100 text-red-700" },
  expired: { key: "billing.expired", cls: "bg-slate-100 text-slate-500" },
};

/** Compress an image file to a JPEG data URL the proof endpoint accepts. */
async function fileToProofDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob) throw new Error("encode failed");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export default function BillingClient() {
  const { t, formatDate, formatDateTime } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<BillingData | null>(null);
  const [justActivated, setJustActivated] = useState(false);
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<{ id: string; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingProofIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/payment-requests", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as BillingData | null;
      if (!res.ok || !json) {
        setLoadError(t("billing.expiredNotice"));
        return;
      }
      // Detect a pending -> approved transition for post-approval routing.
      const nextStatuses = new Map(
        json.requests.map((r) => [r.id, r.status])
      );
      for (const [id, prev] of prevStatuses.current) {
        if (prev === "pending" && nextStatuses.get(id) === "approved") {
          setJustActivated(true);
        }
      }
      prevStatuses.current = nextStatuses;
      setData(json);
      setLoadError("");
    } catch {
      setLoadError(t("billing.expiredNotice"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const hasPending = (data?.requests ?? []).some(
    (r) => r.status === "pending"
  );

  // Poll while a request is pending — paused when the tab is hidden.
  useEffect(() => {
    if (!hasPending) return;
    const tick = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(tick, 15000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasPending, load]);

  // Post-approval routing: store owners go straight to the dashboard;
  // users without a store get the "set up your store" state instead.
  useEffect(() => {
    if (!justActivated || !data) return;
    if (data.hasStore) {
      router.replace("/dashboard");
    }
  }, [justActivated, data, router]);

  const plan = data?.plans[0] ?? null;
  const wallet = data?.instructions.find((i) => i.method === "vodafone_cash");
  const entitlement = data?.entitlement ?? null;
  const pendingRequests = (data?.requests ?? []).filter(
    (r) => r.status === "pending"
  );

  async function submitRequest() {
    if (!plan || submitting) return;
    setFormError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan.key,
          method: "vodafone_cash",
          senderPhone: senderPhone.trim(),
          transactionId: transactionId.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!res.ok) {
        setFormError(json.error ?? t("auraHub.error"));
        return;
      }
      setSenderPhone("");
      setTransactionId("");
      setNotice(t("billing.requestCreated"));
      await load();
    } catch {
      setFormError(t("auraHub.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function pickProof(requestId: string) {
    pendingProofIdRef.current = requestId;
    fileInputRef.current?.click();
  }

  async function onProofFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const requestId = pendingProofIdRef.current;
    event.target.value = "";
    pendingProofIdRef.current = null;
    if (!file || !requestId) return;

    setFormError("");
    setUploadingId(requestId);
    try {
      const proofData = await fileToProofDataUrl(file);
      const res = await fetch(
        `/api/billing/payment-requests/${requestId}/proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofData }),
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setFormError(json.error ?? t("auraHub.error"));
        return;
      }
      await load();
    } catch {
      setFormError(t("auraHub.error"));
    } finally {
      setUploadingId(null);
    }
  }

  async function viewProof(requestId: string) {
    try {
      const res = await fetch(
        `/api/billing/payment-requests/${requestId}/proof`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as {
        proofData?: string;
      } | null;
      if (res.ok && json?.proofData) {
        setProofPreview({ id: requestId, url: json.proofData });
      } else {
        setFormError(t("billing.noProof"));
      }
    } catch {
      setFormError(t("auraHub.error"));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-4 text-slate-600">{loadError || t("auraHub.error")}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const statusLabel =
    entitlement?.status === "active" && entitlement.currentPeriodEnd
      ? t("billing.activeUntil", {
          date: formatDate(entitlement.currentPeriodEnd),
        })
      : entitlement?.status === "expired"
        ? t("billing.statusExpired")
        : entitlement?.status === "none"
          ? t("billing.subscribeToActivate")
          : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          {t("billing.pageTitle")}
        </h1>
        <p className="mt-2 text-slate-600">{t("billing.pageSubtitle")}</p>
      </header>

      {entitlement?.status === "expired" && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t("billing.expiredNotice")}</p>
        </div>
      )}

      {entitlement?.status === "none" && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t("billing.neverPaidNotice")}</p>
        </div>
      )}

      {hasPending && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
          <Clock className="h-5 w-5 shrink-0" />
          <p>{t("billing.waitingApproval")}</p>
        </div>
      )}

      {entitlement?.status === "active" && data.hasStore === false && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            {justActivated
              ? t("billing.subscriptionActive")
              : statusLabel}
          </p>
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("billing.setupStore")}
          </button>
        </div>
      )}

      {entitlement?.status === "active" && data.hasStore === true && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            {statusLabel}
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("billing.backToDashboard")}
          </button>
        </div>
      )}

      {statusLabel && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${
            entitlement?.status === "expired"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {entitlement?.status === "expired" ? (
            <XCircle className="h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          )}
          <span>{statusLabel}</span>
        </div>
      )}

      {plan && (
        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-950">
            {t("billing.choosePlan")}
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xl font-extrabold text-slate-950">
                {t(plan.nameKey)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {plan.price} {plan.currency} ·{" "}
                {t("billing.days", { days: plan.durationDays })}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-indigo-500" />
          </div>

          {wallet && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Wallet className="h-4 w-4" />
                {t("billing.wallet")}
              </p>
              <p className="mt-2 font-mono text-lg font-extrabold tracking-wide text-slate-900" dir="ltr">
                {wallet.account}
              </p>
              {wallet.accountName && (
                <p className="mt-1 text-sm text-slate-600">{wallet.accountName}</p>
              )}
              {wallet.notes && (
                <p className="mt-2 text-xs leading-5 text-slate-500">{wallet.notes}</p>
              )}
            </div>
          )}
        </section>
      )}

      {plan && (
        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-950">
            {t("billing.instructions")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("billing.pageSubtitle")}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">
                {t("billing.senderPhone")}
              </span>
              <input
                type="tel"
                dir="ltr"
                inputMode="tel"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">
                {t("billing.transactionId")}
              </span>
              <input
                type="text"
                dir="ltr"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>

          {formError && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </p>
          )}
          {notice && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submitRequest()}
            disabled={
              submitting ||
              !senderPhone.trim() ||
              !transactionId.trim()
            }
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("billing.submit")}
          </button>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-950">
          {t("billing.yourRequests")}
        </h2>

        {pendingRequests.length > 0 && (
          <div className="mt-4 space-y-3">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900" dir="ltr">
                    {r.referenceCode}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.amount} {r.currency} · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                {r.hasProof ? (
                  <button
                    type="button"
                    onClick={() => void viewProof(r.id)}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
                  >
                    {t("billing.viewProof")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pickProof(r.id)}
                    disabled={uploadingId === r.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {uploadingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {t("billing.proofUpload")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {(data.requests ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              {t("billing.empty")}
            </p>
          )}
          {(data.requests ?? []).map((r) => {
            const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900" dir="ltr">
                    {r.referenceCode}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.amount} {r.currency} · {formatDateTime(r.createdAt)}
                    {r.status === "rejected" && r.rejectReason
                      ? ` · ${r.rejectReason}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.hasProof && r.status !== "pending" && (
                    <button
                      type="button"
                      onClick={() => void viewProof(r.id)}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      {t("billing.viewProof")}
                    </button>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${style.cls}`}
                  >
                    {r.status === "pending" && (
                      <Clock className="h-3 w-3" />
                    )}
                    {t(style.key)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onProofFile(e)}
      />

      {proofPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setProofPreview(null)}
        >
          <div
            className="max-h-[90vh] max-w-3xl overflow-auto rounded-2xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofPreview.url}
              alt={t("billing.proofUpload")}
              className="max-h-[80vh] w-auto rounded-xl"
            />
            <button
              type="button"
              onClick={() => setProofPreview(null)}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

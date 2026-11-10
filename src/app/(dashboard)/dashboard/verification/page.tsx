"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Gift,
  ImagePlus,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { compressImageForUpload } from "@/lib/imageCompress";
import {
  FREE_VERIFICATION_FOLLOWER_TARGET,
  PAID_VERIFICATION_PRICE_EGP,
  VERIFICATION_PAYMENT_METHOD,
  VERIFICATION_PAYMENT_NUMBER,
} from "@/lib/verification";

interface VerificationRequest {
  id: string;
  type: string;
  status: string;
  paymentReference: string;
  paymentProof: string;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

interface VerificationData {
  followerCount: number;
  followerTarget: number;
  isVerified: boolean;
  verificationType: string | null;
  verifiedAt: string | null;
  pendingRequest: VerificationRequest | null;
  requests: VerificationRequest[];
}

const STATUS_LABEL: Record<string, TranslationKey> = {
  pending: "verify.status.pending",
  approved: "verify.status.approved",
  rejected: "verify.status.rejected",
};

const PROOF_DATA_URL_PATTERN =
  /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

export default function VerificationPage() {
  const { t, formatNumber, formatDate } = useI18n();

  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [reference, setReference] = useState("");
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/verification", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as VerificationData;
      setData(json);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function post(payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/dashboard/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error ?? t("verify.actionFailed"));
        return false;
      }
      await load();
      return true;
    } catch {
      showToast(t("verify.actionFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleClaimFree() {
    const ok = await post({ action: "claim-free" }, "claim-free");
    if (ok) showToast(t("verify.claimPending"));
  }

  async function handleProofFile(file: File | null) {
    setProofPreview(null);
    if (!file) return;
    const prepared = await compressImageForUpload(file);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(prepared);
    });
    setProofPreview(dataUrl);
  }

  async function handleSubmitPaid() {
    if (!reference.trim() && !proofPreview) {
      showToast(t("verify.referenceLabel"));
      return;
    }
    setProofUploading(true);
    try {
      const ok = await post(
        {
          action: "submit-paid",
          paymentReference: reference.trim() || undefined,
          paymentProof:
            proofPreview && PROOF_DATA_URL_PATTERN.test(proofPreview)
              ? proofPreview
              : undefined,
        },
        "submit-paid"
      );
      if (ok) {
        showToast(t("verify.proofPending"));
        setReference("");
        setProofPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } finally {
      setProofUploading(false);
    }
  }

  const followerCount = data?.followerCount ?? 0;
  const target = data?.followerTarget ?? FREE_VERIFICATION_FOLLOWER_TARGET;
  const progress = Math.min(100, Math.round((followerCount / target) * 100));
  const hasPending = Boolean(data?.pendingRequest);
  const canClaimFree = followerCount >= target && !hasPending;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 px-5 py-7 text-white shadow-sm sm:px-7">
        <div className="pointer-events-none absolute -top-20 -end-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-7 w-7 text-sky-400" />
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {t("verify.storeTitle")}
              </h1>
            </div>
            <p className="mt-2 max-w-xl text-sm text-indigo-200/90">
              {t("verify.storeSubtitle")}
            </p>
          </div>
          {data?.isVerified && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-400/15 px-4 py-2.5 text-sm font-bold text-emerald-300 ring-1 ring-emerald-300/30">
              <ShieldCheck className="h-5 w-5" />
              {data.verificationType === "free"
                ? t("verify.verifiedFree")
                : data.verificationType === "paid"
                  ? t("verify.verifiedPaid")
                  : t("verify.verifiedTitle")}
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-slate-200/80 bg-white"
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center text-sm text-rose-700">
          {t("verify.loadFailed")}
        </div>
      ) : data ? (
        <>
          {data.isVerified && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                    <BadgeCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900">
                      {t("verify.verifiedTitle")}
                    </p>
                    <p className="text-xs text-emerald-700">
                      {data.verifiedAt
                        ? t("verify.verifiedSince", {
                            date: formatDate(data.verifiedAt),
                          })
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Verification benefits */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 px-5 py-6 text-white shadow-sm sm:px-7">
            <div className="pointer-events-none absolute -top-16 -end-16 h-48 w-48 rounded-full bg-sky-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -start-12 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="relative">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">
                {t("verify.benefitsTitle")}
              </h2>
              <p className="mt-1 text-sm text-indigo-200/80">
                {t("verify.benefitsSubtitle")}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    {
                      icon: ShieldCheck,
                      iconClass: "bg-sky-400/15 text-sky-300",
                      title: "verify.benefit1Title",
                      desc: "verify.benefit1Desc",
                    },
                    {
                      icon: Rocket,
                      iconClass: "bg-violet-400/15 text-violet-300",
                      title: "verify.benefit2Title",
                      desc: "verify.benefit2Desc",
                    },
                    {
                      icon: TrendingUp,
                      iconClass: "bg-emerald-400/15 text-emerald-300",
                      title: "verify.benefit3Title",
                      desc: "verify.benefit3Desc",
                    },
                    {
                      icon: BadgeCheck,
                      iconClass: "bg-amber-400/15 text-amber-300",
                      title: "verify.benefit4Title",
                      desc: "verify.benefit4Desc",
                    },
                  ] as const
                ).map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div
                      key={benefit.title}
                      className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${benefit.iconClass}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-white">
                        {t(benefit.title)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-indigo-200/70">
                        {t(benefit.desc)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Free verification */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
                    <Gift className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t("verify.freeTitle")}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t("verify.freeDesc", { target: formatNumber(target) })}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  {t("verify.type.free")}
                </span>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                    <Users className="h-4 w-4 text-sky-500" />
                    {t("verify.followers")}
                  </span>
                  <span className="font-bold text-slate-900" dir="ltr">
                    {formatNumber(followerCount)} / {formatNumber(target)}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress >= 100
                        ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                        : "bg-gradient-to-r from-sky-400 to-indigo-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {t("verify.ofTarget", { target: formatNumber(target) })}
                </p>
              </div>

              <div className="mt-5">
                {data.isVerified ? (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <Check className="h-4 w-4" />
                    {t("verify.verifiedTitle")}
                  </div>
                ) : hasPending ? (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 ring-1 ring-amber-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("verify.claimPending")}
                  </div>
                ) : canClaimFree ? (
                  <button
                    onClick={() => void handleClaimFree()}
                    disabled={busy === "claim-free"}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-60"
                  >
                    {busy === "claim-free" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="h-4 w-4" />
                    )}
                    {t("verify.claimFree")}
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">
                    {t("verify.needMore", { target: formatNumber(target) })}
                  </p>
                )}
              </div>
            </section>

            {/* Paid verification */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {t("verify.paidTitle")}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t("verify.paidDesc")}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-extrabold text-violet-700" dir="ltr">
                  {PAID_VERIFICATION_PRICE_EGP} EGP
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                  {t("verify.payVia")}
                </p>
                <p
                  className="mt-1 text-xl font-extrabold tracking-wide text-violet-900"
                  dir="ltr"
                >
                  {VERIFICATION_PAYMENT_NUMBER}
                </p>
                <p className="text-xs text-violet-600">
                  {VERIFICATION_PAYMENT_METHOD}
                </p>
              </div>

              <ol className="mt-4 space-y-1.5 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="font-bold text-violet-500">1.</span>
                  {t("verify.payStep1", {
                    amount: formatNumber(PAID_VERIFICATION_PRICE_EGP),
                    number: VERIFICATION_PAYMENT_NUMBER,
                  })}
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-violet-500">2.</span>
                  {t("verify.payStep2")}
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-violet-500">3.</span>
                  {t("verify.payStep3")}
                </li>
              </ol>

              {!data.isVerified && (
                <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {t("verify.referenceLabel")}
                    </label>
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder={t("verify.referencePlaceholder")}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {t("verify.proofLabel")}
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      className="hidden"
                      onChange={(e) => void handleProofFile(e.target.files?.[0] ?? null)}
                    />
                    {proofPreview ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={proofPreview}
                          alt="Payment proof preview"
                          className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                        />
                        <button
                          onClick={() => void handleProofFile(null)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("common.close")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-violet-400 hover:text-violet-600"
                      >
                        <ImagePlus className="h-4 w-4" />
                        {t("verify.chooseImage")}
                      </button>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {t("verify.proofHint")}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleSubmitPaid()}
                    disabled={
                      proofUploading || busy === "submit-paid" || hasPending
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:opacity-60"
                  >
                    {proofUploading || busy === "submit-paid" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {hasPending ? t("verify.proofPending") : t("verify.submitProof")}
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* Requests history */}
          {data.requests.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">
                  {t("verify.requestsTitle")}
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {data.requests.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          req.type === "paid"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {req.type === "paid"
                          ? t("verify.type.paid")
                          : t("verify.type.free")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(req.createdAt)}
                        {req.paymentReference && (
                          <span dir="ltr"> · {req.paymentReference}</span>
                        )}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        req.status === "approved"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : req.status === "rejected"
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                    >
                      {req.status === "approved" && <Check className="h-3 w-3" />}
                      {req.status === "rejected" && <X className="h-3 w-3" />}
                      {STATUS_LABEL[req.status]
                        ? t(STATUS_LABEL[req.status])
                        : req.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}

      {/* Toast */}
      {toast && (
        <div className="fixed end-4 top-4 z-[60] flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

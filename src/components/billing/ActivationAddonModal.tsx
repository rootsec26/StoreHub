"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  Copy,
  Key,
  Loader2,
  MessageSquare,
  Wallet,
  X,
  AlertCircle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  BILLING_PAYMENT_METHODS,
  BILLING_SUPPORT_WHATSAPP,
  WHITE_LABEL_PRICE,
  STAFF_SEAT_PRICE,
} from "@/lib/billing-packages";
import type { BillingInfo } from "@/lib/types";

export type AddOnType = "white_label" | "staff_seats";

interface ActivationAddonModalProps {
  /** `null` keeps the modal closed. */
  addOn: AddOnType | null;
  onClose: () => void;
  /** Called after a successful redemption with the refreshed billing info. */
  onRedeemed: (billing: BillingInfo | null) => void | Promise<void>;
}

type Step = 1 | 2;

export default function ActivationAddonModal({
  addOn,
  onClose,
  onRedeemed,
}: ActivationAddonModalProps) {
  const { t, formatNumber } = useI18n();

  const [step, setStep] = useState<Step>(1);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // NOTE: the parent remounts this modal (via `key`) whenever a new order is
  // opened, so all transient state starts fresh on every purchase.

  useEffect(() => {
    if (!addOn) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOn, onClose]);

  if (!addOn) return null;

  const price = addOn === "white_label" ? WHITE_LABEL_PRICE : STAFF_SEAT_PRICE;
  const titleKey = addOn === "white_label" ? "billing.addons.whiteLabelTitle" : "billing.addons.seatsTitle";
  const descKey = addOn === "white_label" ? "billing.addons.whiteLabelDesc" : "billing.addons.seatsDesc";

  async function copyValue(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  async function handleRedeem() {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/activate-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase(), addOn }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        switch (data?.code) {
          case "KOD_INVALID":
            setError(t("billing.paymentModal.errorInvalid"));
            break;
          case "KOD_USED":
            setError(t("billing.paymentModal.errorUsed"));
            break;
          case "KOD_EXPIRED":
            setError(t("billing.paymentModal.errorExpired"));
            break;
          case "KOD_MISMATCH":
            setError(t("billing.addons.activation.errorMismatch"));
            break;
          default:
            setError(data?.error || t("billing.paymentModal.errorGeneric"));
        }
        return;
      }

      setStep(2);
      await onRedeemed((data?.billing as BillingInfo | undefined) ?? null);
    } catch {
      setError(t("billing.paymentModal.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("billing.addons.activation.title")}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {t("billing.addons.activation.title")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("billing.addons.activation.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("billing.paymentModal.close")}
            className="text-slate-400 transition-colors hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="mt-5 space-y-4">
            {/* Order summary */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {t(titleKey)}
                </p>
                <p className="text-xs text-slate-500">
                  {t("billing.paymentModal.orderSummary")}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-slate-900">
                {t("billing.priceEgp", { price: formatNumber(price) })}
                <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
              </span>
            </div>

            {/* Description */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-xs text-slate-600">{t(descKey)}</p>
            </div>

            {/* Payment numbers */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Wallet className="h-4 w-4 text-emerald-600" />
                {t("billing.paymentModal.payVia")}
              </p>
              <div className="space-y-2">
                {BILLING_PAYMENT_METHODS.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">
                        {method.label}
                      </p>
                      <p
                        dir="ltr"
                        className="truncate font-mono text-sm font-semibold text-slate-900"
                      >
                        {method.number}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue(method.id, method.number)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedId === method.id
                        ? t("billing.paymentModal.copied")
                        : t("billing.paymentModal.copy")}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <a
              href={`https://wa.me/${BILLING_SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              <MessageSquare className="h-4 w-4" />
              {t("billing.paymentModal.supportLink")}
            </a>

            {/* Activation code */}
            <div>
              <label
                htmlFor="activation-code"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                {t("billing.paymentModal.codeLabel")}
              </label>
              <input
                id="activation-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRedeem();
                }}
                placeholder={t("billing.paymentModal.codePlaceholder")}
                autoComplete="off"
                spellCheck={false}
                maxLength={24}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm uppercase text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleRedeem()}
              disabled={!code.trim() || submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Key className="h-4 w-4" />
              {submitting
                ? t("billing.paymentModal.verifying")
                : t("billing.paymentModal.submit")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-4 text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
            <h3 className="text-xl font-bold text-slate-900">
              {t("billing.paymentModal.successTitle")}
            </h3>
            <p className="text-sm text-slate-500">
              {t("billing.addons.activation.successDesc")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              {t("billing.paymentModal.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Bell, BellOff, Loader2, Check } from "lucide-react";

import {
  useI18n,
  type TranslationKey,
  type TranslationVars,
} from "@/lib/i18n";
import { convertAndFormatPrice } from "@/lib/currency";
import { useStoreCurrency } from "@/components/CurrencySelector";
import { classifyContact, type AlertContactType } from "@/lib/price-alerts";

export interface PriceDropAlertProps {
  /** Store this product belongs to (passed from the page). */
  storeId: string;
  storeSlug: string;
  storeCurrency: string;
  storeSupportedCurrencies: string[];
  /** Currently displayed product price in store currency. */
  currentPriceNumber: number;
  /** Current price formatted for display in the selected currency. */
  currentPriceFormatted: string;
  productId: string;
  className?: string;
  /** Whether the current visitor already has an active alert for this product. */
  activeAlert?: boolean;
  onStatusChange?: (active: boolean) => void;
}

type SubmitState = "idle" | "submitting" | "error" | "success";

interface FormState {
  contactRaw: string;
  contactType: AlertContactType | null;
  error: string | null;
}

export default function PriceDropAlert({
  storeId,
  storeSlug,
  storeCurrency,
  storeSupportedCurrencies,
  currentPriceNumber,
  currentPriceFormatted,
  productId,
  className,
  activeAlert: initialActive,
  onStatusChange,
}: PriceDropAlertProps) {
  const { t, locale } = useI18n();
  const { currency: selectedCurrency } = useStoreCurrency(
    storeCurrency,
    storeSupportedCurrencies,
    locale
  );
  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    contactRaw: "",
    contactType: null,
    error: null,
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [existsMessage, setExistsMessage] = useState<string | null>(null);
  // `initialActive` is the server-rendered snapshot; subsequent changes are
  // driven locally after a successful submit.
  const [activeAlert, setActiveAlert] = useState(Boolean(initialActive));

  const markActive = useCallback(() => {
    setActiveAlert(true);
    onStatusChange?.(true);
  }, [onStatusChange]);

  const formattedBaseline = useMemo(
    () =>
      convertAndFormatPrice(currentPriceNumber, storeCurrency, selectedCurrency, priceLocale),
    [currentPriceNumber, storeCurrency, selectedCurrency, priceLocale]
  );

  const handleContactChange = useCallback(
    (raw: string) => {
      const value = raw.trim();
      const contactType = classifyContact(value);
      const error =
        value.length === 0 || contactType
          ? null
          : t("priceAlert.invalidContact");

      setForm((f) => ({
        ...f,
        contactRaw: value,
        contactType,
        error,
      }));
    },
    [t]
  );

  // Reset transient UI state when the modal closes.
  const close = useCallback(() => {
    setOpen(false);
    setForm({ contactRaw: "", contactType: null, error: null });
    setSubmitState("idle");
    setServerError(null);
    setExistsMessage(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitState !== "idle") return;

      const contactType = classifyContact(form.contactRaw);
      if (!contactType) {
        setForm((f) => ({
          ...f,
          error: t("priceAlert.invalidContact"),
        }));
        return;
      }

      setSubmitState("submitting");
      setServerError(null);
      setExistsMessage(null);

      try {
        const res = await fetch("/api/storefront/price-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeSlug,
            productId,
            contactRaw: form.contactRaw,
            baselinePrice: currentPriceNumber.toFixed(2),
          }),
        });

        const data = (await res.json()) as {
          success?: boolean;
          alert?: { id?: string | null; status?: string; existed?: boolean } | null;
          error?: string | null;
          code?: string | null;
          note?: string | null;
        };

        if (!res.ok || !data.success) {
          const message =
            data.error ??
            data.note ??
            t("priceAlert.saveFailed");
          if (res.status === 409 || data.code === "ALREADY_EXISTS") {
            setExistsMessage(message);
            setSubmitState("success");
            markActive();
            return;
          }
          setServerError(message);
          setSubmitState("error");
          return;
        }

        const alertStatus = data.alert?.status;
        if (data.alert?.existed === true) {
          setExistsMessage(
            data.note ?? t("priceAlert.alreadyExists")
          );
          setSubmitState("success");
          markActive();
          return;
        }

        if (alertStatus === "pending" || alertStatus === "exists") {
          setSubmitState("success");
          markActive();
          return;
        }

        setSubmitState("success");
        markActive();
      } catch {
        setServerError(t("priceAlert.saveFailed"));
        setSubmitState("error");
      } finally {
        // Keep the success/error state visible until the user acts.
      }
    },
    [
      storeSlug,
      productId,
      currentPriceNumber,
      form.contactRaw,
      submitState,
      t,
      markActive,
    ]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (activeAlert) return;
          setOpen(true);
        }}
        className={className}
        aria-label={
          activeAlert
            ? t("priceAlert.activeLabel")
            : t("priceAlert.alertLabel")
        }
        aria-pressed={activeAlert}
      >
        {activeAlert ? (
          <BellOff className="h-4 w-4 text-amber-600" />
        ) : (
          <Bell className="h-4 w-4 text-slate-600" />
        )}
      </button>

      {open && (
        <PriceDropAlertModal
          storeCurrency={storeCurrency}
          storeSupportedCurrencies={storeSupportedCurrencies}
          selectedCurrency={selectedCurrency}
          priceLocale={priceLocale}
          productId={productId}
          storeSlug={storeSlug}
          storeId={storeId}
          currentPriceNumber={currentPriceNumber}
          formattedBaseline={formattedBaseline}
          currentPriceFormatted={currentPriceFormatted}
          locale={locale}
          existingContactType={form.contactType}
          contactRaw={form.contactRaw}
          contactError={form.error}
          onContactChange={handleContactChange}
          submitState={submitState}
          serverError={serverError}
          existsMessage={existsMessage}
          onClose={close}
          onSubmit={handleSubmit}
          t={t}
        />
      )}
    </>
  );
}

interface PriceDropAlertModalProps {
  storeCurrency: string;
  storeSupportedCurrencies: string[];
  selectedCurrency: string;
  priceLocale: string;
  productId: string;
  storeSlug: string;
  storeId: string;
  currentPriceNumber: number;
  formattedBaseline: string;
  currentPriceFormatted: string;
  locale: "en" | "ar";
  existingContactType: AlertContactType | null;
  contactRaw: string;
  contactError: string | null;
  onContactChange: (raw: string) => void;
  submitState: SubmitState;
  serverError: string | null;
  existsMessage: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  t: (key: TranslationKey, params?: TranslationVars) => string;
}

function PriceDropAlertModal({
  storeCurrency,
  storeSupportedCurrencies,
  selectedCurrency,
  priceLocale,
  productId,
  storeSlug,
  storeId,
  currentPriceNumber,
  formattedBaseline,
  currentPriceFormatted,
  locale,
  existingContactType,
  contactRaw,
  contactError,
  onContactChange,
  submitState,
  serverError,
  existsMessage,
  onClose,
  onSubmit,
  t,
}: PriceDropAlertModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();

    const previousFocus = document.activeElement as HTMLElement | null;
    const restoreFocus = () => {
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };

    return () => {
      dialog.close();
      restoreFocus();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (submitState === "submitting") {
      inputRef.current?.focus();
    }
  }, [submitState]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  const isRtl = locale === "ar";

  return (
    <dialog
      ref={dialogRef}
      className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl backdrop:backdrop-blur-sm ${
        isRtl ? "rtl" : ""
      }`}
      style={{
        transform: "translate(-50%, -50%)",
        backgroundColor: "var(--color-background, #ffffff)",
      }}
      onClick={handleOverlayClick}
      aria-labelledby="price-alert-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="price-alert-title"
            className="text-lg font-semibold text-slate-900"
            style={{ color: "var(--color-text)" }}
          >
            {t("priceAlert.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("priceAlert.subtitle", { price: currentPriceFormatted })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label={t("common.close")}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        {/* Baseline price summary */}
        <div
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-primary-soft)" }}
        >
          <span className="text-slate-600">{t("priceAlert.baselineLabel")}</span>
          <span className="font-medium text-[var(--color-primary)]">
            {formattedBaseline}
          </span>
        </div>

        {/* Contact input */}
        <div>
          <label
            htmlFor="price-alert-contact"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            {t("priceAlert.contactLabel")}
          </label>
          <div className="relative">
            <input
              id="price-alert-contact"
              ref={inputRef}
              type={existingContactType === "email" ? "email" : "tel"}
              inputMode={existingContactType === "email" ? "email" : "numeric"}
              value={contactRaw}
              onChange={(event) => onContactChange(event.target.value)}
              placeholder={
                existingContactType === "email"
                  ? t("priceAlert.emailPlaceholder")
                  : t("priceAlert.phonePlaceholder")
              }
              autoComplete="off"
              className={`w-full rounded-lg border bg-white py-2.5 ps-3 pe-10 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] ${
                contactError ? "border-rose-400" : ""
              }`}
            />
            {existingContactType === "email" ? (
              <MailIcon className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            ) : (
              <PhoneIcon className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            )}
          </div>
          {contactError && (
            <p className="mt-1 text-xs text-rose-600">{contactError}</p>
          )}
        </div>

        {/* Feedback messages */}
        {serverError && (
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {serverError}
          </div>
        )}

        {existsMessage && (
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            role="status"
          >
            {existsMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            style={{ color: "var(--color-text)" }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitState === "submitting" || !contactRaw.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {submitState === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("common.saving")}
              </>
            ) : submitState === "success" ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("priceAlert.doneLabel")}
              </>
            ) : (
              t("priceAlert.saveLabel")
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

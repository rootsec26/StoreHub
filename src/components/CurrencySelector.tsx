"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { convertAndFormatPrice, getSupportedCurrencies, getCurrencyInfo, type CurrencyCode } from "@/lib/currency";

interface CurrencySelectorProps {
  storeCurrency: string;
  storeSupportedCurrencies: string[];
  onCurrencyChange?: (currency: string) => void;
}

function getCookieCurrency(supportedCurrencies: string[]): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("storehub_currency="))
    ?.split("=")[1] ?? null;
}

export default function CurrencySelector({
  storeCurrency,
  storeSupportedCurrencies,
  onCurrencyChange,
}: CurrencySelectorProps) {
  const { t, locale } = useI18n();
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    const cookieCurrency = getCookieCurrency(storeSupportedCurrencies);
    return cookieCurrency && storeSupportedCurrencies.includes(cookieCurrency) ? cookieCurrency : storeCurrency;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const cookieCurrency = getCookieCurrency(storeSupportedCurrencies);
    if (cookieCurrency && storeSupportedCurrencies.includes(cookieCurrency)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCurrency(cookieCurrency);
    } else {
      setSelectedCurrency(storeCurrency);
    }
  }, [mounted, storeSupportedCurrencies, storeCurrency]);

  const handleCurrencyChange = useCallback(
    (currency: string) => {
      if (!storeSupportedCurrencies.includes(currency)) return;
      setSelectedCurrency(currency);
      setIsOpen(false);
      document.cookie = `storehub_currency=${currency}; path=/; max-age=31536000; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`;
      onCurrencyChange?.(currency);
      window.dispatchEvent(new CustomEvent("currency-change", { detail: { currency } }));
    },
    [storeSupportedCurrencies, onCurrencyChange]
  );

  const supportedCurrencies = getSupportedCurrencies().filter((c) =>
    storeSupportedCurrencies.includes(c)
  );

  if (!mounted) {
    return (
      <div className="relative inline-flex items-center">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600"
          disabled
          aria-label={t("store.currency")}
        >
          <span className="h-4 w-4 animate-pulse rounded bg-slate-200" />
          <span className="h-4 w-4 animate-pulse rounded bg-slate-200" />
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--store-accent)]"
        aria-label={t("store.currency")}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="font-medium">{selectedCurrency}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-50 mt-1.5 w-40 origin-top-right rounded-lg border border-slate-200 bg-white shadow-lg animate-in fade-in-0 zoom-in-95">
            <ul role="listbox" aria-label={t("store.currency")} className="py-1">
              {supportedCurrencies.map((currencyCode) => {
                const info = getCurrencyInfo(currencyCode);
                const isSelected = currencyCode === selectedCurrency;
                return (
                  <li key={currencyCode}>
                    <button
                      onClick={() => handleCurrencyChange(currencyCode)}
                      role="option"
                      aria-selected={isSelected}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        isSelected
                          ? "bg-[var(--store-accent)] text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-medium min-w-[3.5rem]">{currencyCode}</span>
                      <span className="flex-1 text-slate-500 truncate">{info.name}</span>
                      {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function useStoreCurrency(
  storeCurrency: string,
  storeSupportedCurrencies: string[],
  locale: "en" | "ar"
): { currency: string; formattedPrice: (amount: number) => string } {
  // Start from the store currency so the first client render matches SSR,
  // then sync the visitor's cookie choice once mounted.
  const [currency, setCurrency] = useState<string>(storeCurrency);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const cookieCurrency = document.cookie
      .split("; ")
      .find((row) => row.startsWith("storehub_currency="))
      ?.split("=")[1];
    if (cookieCurrency && storeSupportedCurrencies.includes(cookieCurrency)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrency(cookieCurrency);
    } else {
      setCurrency(storeCurrency);
    }
  }, [storeCurrency, storeSupportedCurrencies]);

  useEffect(() => {
    function handleCurrencyChange(event: CustomEvent<{ currency: string }>) {
      if (storeSupportedCurrencies.includes(event.detail.currency)) {
        setCurrency(event.detail.currency);
      }
    }
    window.addEventListener("currency-change", handleCurrencyChange as EventListener);
    return () =>
      window.removeEventListener("currency-change", handleCurrencyChange as EventListener);
  }, [storeSupportedCurrencies]);

  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  const formattedPrice = useCallback(
    (amount: number) =>
      convertAndFormatPrice(amount, storeCurrency, currency, priceLocale),
    [storeCurrency, currency, priceLocale]
  );

  return { currency, formattedPrice };
}
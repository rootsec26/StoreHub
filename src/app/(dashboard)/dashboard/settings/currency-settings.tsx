"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Loader2,
  Save,
  CheckCircle,
  Globe,
  Info,
} from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { getSupportedCurrencies, getCurrencyInfo } from "@/lib/currency";

interface CurrencySettingsProps {
  storeId: string;
}

const SUPPORTED_CURRENCIES = getSupportedCurrencies();

export default function CurrencySettings({ storeId }: CurrencySettingsProps) {
  const { t } = useI18n();

  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([
    "EGP",
    "USD",
    "SAR",
    "AED",
    "EUR",
  ]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchCurrencySettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/stores/${storeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.store) {
          setBaseCurrency(data.store.currency || "EGP");
          setSupportedCurrencies(data.store.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch currency settings:", error);
    }
  }, [storeId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    fetchCurrencySettings().then(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [fetchCurrencySettings]);

  const handleToggleCurrency = (currency: string) => {
    setSupportedCurrencies((prev) => {
      if (prev.includes(currency)) {
        if (currency === baseCurrency) return prev;
        return prev.filter((c) => c !== currency);
      }
      return [...prev, currency];
    });
  };

  const handleBaseCurrencyChange = (currency: string) => {
    setBaseCurrency(currency);
    if (!supportedCurrencies.includes(currency)) {
      setSupportedCurrencies((prev) => [...prev, currency]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: baseCurrency,
          supportedCurrencies,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update currency settings");
      }

      showToast(t("currency.toast.saved"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("currency.toast.failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const getCurrencyLabel = (code: string) => {
    const info = getCurrencyInfo(code);
    return `${code} — ${info.name} (${info.symbol})`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed end-4 top-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg flex items-center gap-2 ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <DollarSign className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("currency.title")}
            </h3>
            <p className="text-sm text-slate-500">{t("currency.subtitle")}</p>
          </div>
        </div>

        {/* Base Currency */}
        <div className="mb-8">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {t("currency.baseCurrency")}
          </label>
          <p className="mb-3 text-sm text-slate-500">{t("currency.baseCurrencyHint")}</p>
          <div className="relative">
            <DollarSign className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={baseCurrency}
              onChange={(e) => handleBaseCurrencyChange(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-300 py-2.5 ps-10 pe-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {getCurrencyLabel(currency)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Supported Currencies */}
        <div className="mb-8">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {t("currency.supportedCurrencies")}
          </label>
          <p className="mb-3 text-sm text-slate-500">{t("currency.supportedCurrenciesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CURRENCIES.map((currency) => {
              const info = getCurrencyInfo(currency);
              const isEnabled = supportedCurrencies.includes(currency);
              const isBase = currency === baseCurrency;
              return (
                <label
                  key={currency}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    isEnabled
                      ? isBase
                        ? "bg-indigo-50 border border-indigo-300 text-indigo-800"
                        : "bg-emerald-50 border border-emerald-300 text-emerald-800"
                      : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled || isBase}
                    onChange={() => !isBase && handleToggleCurrency(currency)}
                    disabled={isBase}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className="font-medium">{currency}</span>
                  <span className="text-xs text-slate-500">{info.name}</span>
                  {isBase && (
                    <span title={t("currency.baseCurrency")} className="flex items-center">
                      <CheckCircle className="h-3.5 w-3.5 text-indigo-600" />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 text-slate-400 flex-shrink-0" />
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900 mb-1">{t("currency.infoTitle")}</p>
            <p>{t("currency.infoDescription")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
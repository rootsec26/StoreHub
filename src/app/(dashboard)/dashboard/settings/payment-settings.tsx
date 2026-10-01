"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Smartphone,
  Banknote,
  Loader2,
  Save,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Key,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface PaymentSettingsProps {
  storeId: string;
}

export default function PaymentSettings({ storeId }: PaymentSettingsProps) {
  const { t } = useI18n();

  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [stripeOnboardingUrl, setStripeOnboardingUrl] = useState("");

  const [paddleEnabled, setPaddleEnabled] = useState(false);
  const [paddleVendorId, setPaddleVendorId] = useState("");
  const [paddleAuthCode, setPaddleAuthCode] = useState("");
  const [paddleWebhookSecret, setPaddleWebhookSecret] = useState("");

  const [manualEnabled, setManualEnabled] = useState(true);
  const [vodafoneCashNumber, setVodafoneCashNumber] = useState("");
  const [instaPayNumber, setInstaPayNumber] = useState("");
  const [cashOnDeliveryEnabled, setCashOnDeliveryEnabled] = useState(true);
  const [manualInstructions, setManualInstructions] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchPaymentSettings = useCallback(async () => {
    const res = await fetch(`/api/stores/${storeId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.store) return;
    
    setStripeEnabled(data.store.stripeEnabled || false);
    setStripeAccountId(data.store.stripeAccountId || "");
    setPaddleEnabled(data.store.paddleEnabled || false);
    setPaddleVendorId(data.store.paddleVendorId || "");
    setManualEnabled(data.store.manualPaymentInstructions ? true : true);
    
    if (data.store.manualPaymentInstructions) {
      const instructions = data.store.manualPaymentInstructions;
      try {
        const parsed = JSON.parse(instructions);
        setVodafoneCashNumber(parsed.vodafoneCashNumber || "");
        setInstaPayNumber(parsed.instaPayNumber || "");
        setCashOnDeliveryEnabled(parsed.cashOnDeliveryEnabled !== false);
        setManualInstructions(parsed.instructions || "");
      } catch {
        setManualInstructions(instructions);
      }
    }
  }, [storeId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchPaymentSettings();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [fetchPaymentSettings]);

  const handleStripeConnect = async () => {
    setStripeStatus("connecting");
    try {
      const res = await fetch("/api/payments/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect Stripe");

      setStripeAccountId(data.accountId);
      setStripeOnboardingUrl(data.onboardingUrl);
      setStripeStatus("connected");
      showToast(t("payment.stripe.connected"), "success");

      if (data.onboardingUrl) {
        window.open(data.onboardingUrl, "_blank");
      }
    } catch (error) {
      setStripeStatus("error");
      showToast(error instanceof Error ? error.message : t("payment.stripe.connectFailed"), "error");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const manualPaymentConfig = {
        vodafoneCashNumber,
        instaPayNumber,
        cashOnDeliveryEnabled,
        instructions: manualInstructions,
      };

      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeEnabled,
          stripeAccountId,
          paddleEnabled,
          paddleVendorId,
          manualPaymentInstructions: JSON.stringify(manualPaymentConfig),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update payment settings");
      }

      showToast(t("payment.toast.saved"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("payment.toast.failed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const testStripeConnection = async () => {
    try {
      const res = await fetch("/api/payments/stripe/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: stripeAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      showToast(t("payment.stripe.testSuccess"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("payment.stripe.testFailed"), "error");
    }
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

      {/* Stripe Settings */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <CreditCard className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("payment.stripe.title")}
            </h3>
            <p className="text-sm text-slate-500">{t("payment.stripe.subtitle")}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Stripe Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("payment.stripe.enable")}
              </label>
              <p className="text-sm text-slate-500">{t("payment.stripe.enableHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setStripeEnabled(!stripeEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                stripeEnabled ? "bg-indigo-600" : "bg-slate-200"
              }`}
              role="switch"
              aria-checked={stripeEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  stripeEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {stripeEnabled && (
            <>
              {/* Stripe Connect Status */}
              <div className={`rounded-lg p-4 border ${
                stripeConnected ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      stripeConnected ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                    }`}>
                      {stripeConnected ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {stripeConnected ? t("payment.stripe.connectedStatus") : t("payment.stripe.notConnected")}
                      </p>
                      <p className="text-sm text-slate-500">
                        {stripeConnected 
                          ? t("payment.stripe.readyToAccept") 
                          : t("payment.stripe.connectRequired")}
                      </p>
                    </div>
                  </div>
                  {!stripeConnected && stripeAccountId && (
                    <button
                      type="button"
                      onClick={testStripeConnection}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {t("payment.stripe.testConnection")}
                    </button>
                  )}
                </div>
              </div>

              {/* Stripe Connect Button */}
              {!stripeConnected && (
                <button
                  type="button"
                  onClick={handleStripeConnect}
                  disabled={stripeStatus === "connecting"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {stripeStatus === "connecting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      {t("payment.stripe.connectAccount")}
                    </>
                  )}
                </button>
              )}

              {/* Stripe Account ID */}
              {stripeAccountId && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("payment.stripe.accountId")}
                  </label>
                  <div className="relative">
                    <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={stripeAccountId}
                      readOnly
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 ps-10 pe-4 text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Stripe API Keys (for direct integration) */}
              <div className="border-t pt-6">
                <h4 className="mb-4 text-sm font-medium text-slate-700">{t("payment.stripe.apiKeys")}</h4>
                <p className="mb-4 text-xs text-slate-500">{t("payment.stripe.apiKeysHint")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      {t("payment.stripe.publishableKey")}
                    </label>
                    <div className="relative">
                      <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={stripePublishableKey}
                        onChange={(e) => setStripePublishableKey(e.target.value)}
                        placeholder="pk_test_..."
                        className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      {t("payment.stripe.secretKey")}
                    </label>
                    <div className="relative">
                      <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={stripeSecretKey}
                        onChange={(e) => setStripeSecretKey(e.target.value)}
                        placeholder="sk_test_..."
                        className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("payment.stripe.webhookSecret")}
                  </label>
                  <div className="relative">
                    <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={stripeWebhookSecret}
                      onChange={(e) => setStripeWebhookSecret(e.target.value)}
                      placeholder="whsec_..."
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t("payment.stripe.webhookSecretHint")}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Paddle Settings */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <Smartphone className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("payment.paddle.title")}
            </h3>
            <p className="text-sm text-slate-500">{t("payment.paddle.subtitle")}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("payment.paddle.enable")}
              </label>
              <p className="text-sm text-slate-500">{t("payment.paddle.enableHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setPaddleEnabled(!paddleEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                paddleEnabled ? "bg-blue-600" : "bg-slate-200"
              }`}
              role="switch"
              aria-checked={paddleEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  paddleEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {paddleEnabled && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("payment.paddle.vendorId")}
                </label>
                <div className="relative">
                  <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={paddleVendorId}
                    onChange={(e) => setPaddleVendorId(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("payment.paddle.authCode")}
                </label>
                <div className="relative">
                  <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={paddleAuthCode}
                    onChange={(e) => setPaddleAuthCode(e.target.value)}
                    placeholder="****************"
                    className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("payment.paddle.webhookSecret")}
                </label>
                <div className="relative">
                  <Key className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={paddleWebhookSecret}
                    onChange={(e) => setPaddleWebhookSecret(e.target.value)}
                    placeholder="pdl_webhook_..."
                    className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Payment Methods */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2">
            <Banknote className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t("payment.manual.title")}
            </h3>
            <p className="text-sm text-slate-500">{t("payment.manual.subtitle")}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t("payment.manual.enable")}
              </label>
              <p className="text-sm text-slate-500">{t("payment.manual.enableHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setManualEnabled(!manualEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                manualEnabled ? "bg-emerald-600" : "bg-slate-200"
              }`}
              role="switch"
              aria-checked={manualEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  manualEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {manualEnabled && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("payment.manual.vodafoneCash")}
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      dir="ltr"
                      value={vodafoneCashNumber}
                      onChange={(e) => setVodafoneCashNumber(e.target.value)}
                      placeholder="010xxxxxxxx"
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("payment.manual.instaPay")}
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      dir="ltr"
                      value={instaPayNumber}
                      onChange={(e) => setInstaPayNumber(e.target.value)}
                      placeholder="010xxxxxxxx"
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t("payment.manual.cashOnDelivery")}
                  </label>
                  <p className="text-sm text-slate-500">{t("payment.manual.cashOnDeliveryHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCashOnDeliveryEnabled(!cashOnDeliveryEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    cashOnDeliveryEnabled ? "bg-emerald-600" : "bg-slate-200"
                  }`}
                  role="switch"
                  aria-checked={cashOnDeliveryEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      cashOnDeliveryEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("payment.manual.instructions")}
                </label>
                <textarea
                  value={manualInstructions}
                  onChange={(e) => setManualInstructions(e.target.value)}
                  placeholder={t("payment.manual.instructionsPlaceholder")}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 pe-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-slate-500">{t("payment.manual.instructionsHint")}</p>
              </div>
            </div>
          )}
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
  );
}
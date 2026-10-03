"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Package,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { convertAndFormatPrice } from "@/lib/currency";
import { useStoreCurrency } from "@/components/CurrencySelector";

interface VerifyOrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  product: { name: string } | null;
}

interface VerifyOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  totalAmount: string;
  status: string;
  codVerificationStatus: string;
  riskScore: string;
  riskReasons: string[];
  createdAt: string;
  items: VerifyOrderItem[];
}

type ViewState = "loading" | "ready" | "submitting" | "confirmed" | "cancelled" | "error";

/**
 * Fallback short link used when WhatsApp interactive buttons are unavailable:
 * https://[store].storehub.com/order/[id]/verify
 */
export default function CodVerifyPage() {
  const params = useParams();
  const slug = params.slug as string;
  const orderId = params.id as string;

  const { t, locale, formatDateTime } = useI18n();

  const [order, setOrder] = useState<VerifyOrder | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [error, setError] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeAccent, setStoreAccent] = useState("");
  const [storeCurrency, setStoreCurrency] = useState("EGP");
  const [storeSupportedCurrencies, setStoreSupportedCurrencies] = useState<string[]>([
    "EGP",
    "USD",
    "SAR",
    "AED",
    "EUR",
  ]);

  const { currency: selectedCurrency } = useStoreCurrency(
    storeCurrency,
    storeSupportedCurrencies,
    locale
  );
  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  useEffect(() => {
    const storeRequest = fetch(
      `/api/products?slug=${encodeURIComponent(slug)}&visible=true`,
      { cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const orderRequest = fetch(
      `/api/storefront/orders/track?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(orderId)}`,
      { cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.all([storeRequest, orderRequest])
      .then(([storeData, orderData]) => {
        if (storeData?.store) {
          setStoreName(storeData.store.name || "");
          setStoreAccent(storeData.store.accentColor || "");
          setStoreCurrency(storeData.store.currency || "EGP");
          setStoreSupportedCurrencies(
            storeData.store.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"]
          );
        }

        const loaded: VerifyOrder | undefined = orderData?.order;
        if (!loaded) {
          setState("error");
          setError(t("verify.notFound"));
          return;
        }

        setOrder(loaded);
        if (loaded.codVerificationStatus === "VERIFIED") {
          setState("confirmed");
        } else if (loaded.status === "Cancelled") {
          setState("cancelled");
        } else {
          setState("ready");
        }
      })
      .catch(() => {
        setState("error");
        setError(t("verify.failed"));
      });
  }, [slug, orderId, t]);

  async function respond(decision: "CONFIRMED" | "CANCELLED") {
    if (!order || state === "submitting") return;
    setState("submitting");
    setError("");

    try {
      const res = await fetch("/api/orders/verify-cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          status: decision,
          store_slug: slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("verify.failed"));
      }
      setState(decision === "CONFIRMED" ? "confirmed" : "cancelled");
    } catch (err) {
      setState("ready");
      setError(err instanceof Error && err.message ? err.message : t("verify.failed"));
    }
  }

  const money = (value: string | number) =>
    convertAndFormatPrice(Number(value) || 0, storeCurrency, selectedCurrency, priceLocale);

  return (
    <div
      style={accentThemeStyle(normalizeAccent(storeAccent))}
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href={`/store/${slug}`}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("checkout.continueShopping")}
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("verify.badge")}
          </span>
        </div>

        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{t("verify.loading")}</p>
          </div>
        )}

        {state === "error" && (
          <div className="py-8 text-center">
            <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="text-sm text-slate-600">{error || t("verify.notFound")}</p>
          </div>
        )}

        {(state === "ready" || state === "submitting") && order && (
          <>
            <h1 className="mb-1 text-xl font-bold text-slate-900">{t("verify.title")}</h1>
            <p className="mb-5 text-sm text-slate-500">{t("verify.subtitle")}</p>

            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {storeName || t("verify.order")}
                </span>
                <span className="text-xs text-slate-400">
                  {formatDateTime(order.createdAt)}
                </span>
              </div>

              <ul className="mb-3 space-y-2">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-slate-700">
                      {item.product?.name || t("verify.item")}
                      <span className="ms-1 text-xs text-slate-400">× {item.quantity}</span>
                    </span>
                    <span className="font-medium text-slate-900">
                      {money(Number(item.unitPrice) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                <span>{t("orders.orderSummary")}</span>
                <span>{money(order.totalAmount)}</span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <p>{t("orders.customerInfo")}: {order.customerName}</p>
                {order.customerAddress && (
                  <p>
                    {t("table.address")}: {order.customerAddress}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => respond("CONFIRMED")}
                disabled={state === "submitting"}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {state === "submitting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {state === "submitting" ? t("verify.working") : t("verify.confirm")}
              </button>
              <button
                type="button"
                onClick={() => respond("CANCELLED")}
                disabled={state === "submitting"}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <CircleSlash className="h-4 w-4" />
                {t("verify.cancel")}
              </button>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
          </>
        )}

        {state === "confirmed" && order && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-full bg-emerald-100 p-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h1 className="mb-1 text-xl font-bold text-slate-900">
              {t("verify.confirmedTitle")}
            </h1>
            <p className="mb-6 text-sm text-slate-500">{t("verify.confirmedSubtitle")}</p>
            <Link
              href={`/store/${slug}/track-order?id=${encodeURIComponent(order.id)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Package className="h-4 w-4" />
              {t("verify.trackOrder")}
            </Link>
          </div>
        )}

        {state === "cancelled" && order && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 inline-flex rounded-full bg-red-100 p-4">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="mb-1 text-xl font-bold text-slate-900">
              {t("verify.cancelledTitle")}
            </h1>
            <p className="mb-6 text-sm text-slate-500">{t("verify.cancelledSubtitle")}</p>
            <Link
              href={`/store/${slug}`}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {t("checkout.continueShopping")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

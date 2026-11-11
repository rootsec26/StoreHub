"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  PRODUCT_KEYS,
  PRODUCT_REGISTRY,
  hasProductAccess,
  type ProductAccessStatus,
  type ProductKey,
  type UserProductMap,
} from "@/lib/products";

interface SelectProductClientProps {
  products: UserProductMap;
  lastUsedProduct: ProductKey | null;
  next: string | null;
  /** User owns/belongs to a store — drives the StoreHub pay-first CTA. */
  hasStore?: boolean;
}

function badgeFor(
  status: ProductAccessStatus | "coming_soon"
): { key: TranslationKey; className: string } {
  switch (status) {
    case "active":
      return {
        key: "auraHub.badgeActive",
        className: "bg-emerald-100 text-emerald-700 ring-emerald-200",
      };
    case "trial":
      return {
        key: "auraHub.badgeInProgress",
        className: "bg-amber-100 text-amber-700 ring-amber-200",
      };
    case "expired":
      return {
        key: "auraHub.badgeExpired",
        className: "bg-red-100 text-red-700 ring-red-200",
      };
    case "none":
      return {
        key: "auraHub.badgeNotActivated",
        className: "bg-slate-100 text-slate-500 ring-slate-200",
      };
    default:
      return {
        key: "auraHub.badgeComingSoon",
        className: "bg-violet-100 text-violet-700 ring-violet-200",
      };
  }
}

export default function SelectProductClient({
  products,
  lastUsedProduct,
  next,
  hasStore = false,
}: SelectProductClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<ProductKey | null>(null);
  const [waitlisted, setWaitlisted] = useState<Set<ProductKey>>(
    () =>
      new Set(
        PRODUCT_KEYS.filter((key) => products[key]?.waitlisted === true)
      )
  );
  const [error, setError] = useState("");

  const activeCount = PRODUCT_KEYS.filter((key) =>
    hasProductAccess(products, key)
  ).length;

  async function enterProduct(key: ProductKey) {
    if (pendingKey) return;
    setError("");
    setPendingKey(key);
    try {
      const res = await fetch("/api/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: key, action: "enter", next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        redirectUrl?: string;
        comingSoon?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("auraHub.error"));
        return;
      }
      if (data.comingSoon || !data.redirectUrl) return;
      router.push(data.redirectUrl);
      router.refresh();
    } catch {
      setError(t("auraHub.error"));
    } finally {
      setPendingKey(null);
    }
  }

  async function notifyMe(key: ProductKey) {
    if (pendingKey) return;
    setError("");
    setPendingKey(key);
    try {
      const res = await fetch("/api/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: key, action: "waitlist" }),
      });
      if (res.ok) {
        setWaitlisted((current) => new Set(current).add(key));
      } else {
        setError(t("auraHub.error"));
      }
    } catch {
      setError(t("auraHub.error"));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            {t("auraHub.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-slate-600">
            {t("auraHub.subtitle")}
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-6 max-w-md rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          {PRODUCT_KEYS.map((key) => {
            const def = PRODUCT_REGISTRY[key];
            const Icon = def.icon;
            const access = products[key];
            const comingSoon = def.status === "coming_soon";
            const hasAccess = hasProductAccess(products, key);
            const badge = badgeFor(
              comingSoon ? "coming_soon" : (access?.status ?? "none")
            );
            const isLastUsed = lastUsedProduct === key && activeCount > 1;
            const isPending = pendingKey === key;
            const onWaitlist = waitlisted.has(key) || access?.waitlisted === true;

            return (
              <article
                key={key}
                className={`relative flex h-full flex-col rounded-3xl border bg-white p-6 shadow-sm transition-all ${
                  isLastUsed
                    ? "border-indigo-300 shadow-lg shadow-indigo-100/60"
                    : "border-slate-200"
                }`}
              >
                {isLastUsed && (
                  <span className="absolute -top-3 start-6 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-extrabold text-white shadow">
                    {t("auraHub.continueLabel")}
                  </span>
                )}

                <div className="mb-5 flex items-start justify-between gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      comingSoon
                        ? "bg-slate-100 text-slate-400"
                        : hasAccess
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                          : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ring-1 ${badge.className}`}
                  >
                    {t(badge.key)}
                  </span>
                </div>

                <h2 className="text-xl font-extrabold tracking-tight text-slate-950">
                  {t(def.nameKey)}
                </h2>
                <p className="mt-1 text-sm font-semibold text-indigo-600">
                  {t(def.taglineKey)}
                </p>
                <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">
                  {t(def.descriptionKey)}
                </p>

                <div className="mt-6">
                  {comingSoon ? (
                    <div className="space-y-3">
                      <p className="text-xs leading-6 text-slate-500">
                        {t("auraHub.comingSoonBody", { name: t(def.nameKey) })}
                      </p>
                      {onWaitlist ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full cursor-default items-center justify-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200"
                        >
                          {t("auraHub.waitlisted")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void notifyMe(key)}
                          disabled={isPending}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {t("auraHub.notifyMe")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void enterProduct(key)}
                      disabled={isPending}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {t(
                            key === "storehub"
                              ? access?.status === "active"
                                ? hasStore
                                  ? isLastUsed
                                    ? "auraHub.ctaContinue"
                                    : "auraHub.ctaOpen"
                                  : "auraHub.ctaSetupStore"
                                : access?.status === "expired"
                                  ? "billing.renew"
                                  : "auraHub.ctaSubscribe"
                              : hasAccess
                                ? isLastUsed
                                  ? "auraHub.ctaContinue"
                                  : "auraHub.ctaOpen"
                                : "auraHub.ctaStart"
                          )}
                          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

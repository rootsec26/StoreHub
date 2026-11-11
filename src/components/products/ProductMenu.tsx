"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Layers, Loader2 } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  PRODUCT_KEYS,
  PRODUCT_REGISTRY,
  hasProductAccess,
  type ProductAccessStatus,
  type ProductKey,
  type UserProductMap,
} from "@/lib/products";

interface ProductState {
  products: UserProductMap;
  lastUsedProduct: ProductKey | null;
}

function badgeMeta(
  status: ProductAccessStatus | "coming_soon"
): { key: TranslationKey; className: string } {
  switch (status) {
    case "active":
      return {
        key: "auraHub.badgeActive",
        className: "bg-emerald-100 text-emerald-700",
      };
    case "trial":
      return {
        key: "auraHub.badgeInProgress",
        className: "bg-amber-100 text-amber-700",
      };
    case "expired":
      return {
        key: "auraHub.badgeExpired",
        className: "bg-red-100 text-red-700",
      };
    case "none":
      return {
        key: "auraHub.badgeNotActivated",
        className: "bg-slate-100 text-slate-500",
      };
    default:
      return {
        key: "auraHub.badgeComingSoon",
        className: "bg-violet-100 text-violet-700",
      };
  }
}

/**
 * Compact product switcher for the dashboard header. Fetches the user's
 * effective product map from /api/hub and lets them jump between Aura
 * products (or hit the coming-soon waitlist) without leaving the dashboard.
 */
export default function ProductMenu() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<ProductState | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<ProductKey | null>(null);
  const [waitlisted, setWaitlisted] = useState<Set<ProductKey>>(new Set());
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hub")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProductState | null) => {
        if (cancelled || !data) return;
        setState(data);
        setWaitlisted(
          new Set(
            PRODUCT_KEYS.filter((key) => data.products[key]?.waitlisted === true)
          )
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function enterProduct(key: ProductKey) {
    if (pendingKey) return;
    setError(false);
    setPendingKey(key);
    try {
      const res = await fetch("/api/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: key, action: "enter" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        redirectUrl?: string;
        comingSoon?: boolean;
      };
      if (!res.ok || data.comingSoon || !data.redirectUrl) {
        setError(true);
        return;
      }
      setOpen(false);
      router.push(data.redirectUrl);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPendingKey(null);
    }
  }

  async function notifyMe(key: ProductKey) {
    if (pendingKey) return;
    setError(false);
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
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setPendingKey(null);
    }
  }

  if (!state) return null;

  const currentKey =
    state.lastUsedProduct &&
    PRODUCT_KEYS.includes(state.lastUsedProduct) &&
    hasProductAccess(state.products, state.lastUsedProduct)
      ? state.lastUsedProduct
      : (PRODUCT_KEYS.find((key) => hasProductAccess(state.products, key)) ??
        "storehub");
  const currentDef = PRODUCT_REGISTRY[currentKey];
  const CurrentIcon = currentDef.icon;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        title={t("auraHub.switchProduct")}
        aria-label={t("auraHub.switchProduct")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Layers className="h-4 w-4" />
        <span className="hidden sm:inline">{t(currentDef.nameKey)}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t("auraHub.productsLabel")}
            </p>
          </div>

          {error && (
            <p className="px-4 py-2 text-xs text-red-600">{t("auraHub.error")}</p>
          )}

          <ul className="p-1.5">
            {PRODUCT_KEYS.map((key) => {
              const def = PRODUCT_REGISTRY[key];
              const Icon = def.icon;
              const access = state.products[key];
              const comingSoon = def.status === "coming_soon";
              const accessible = hasProductAccess(state.products, key);
              const badge = badgeMeta(
                comingSoon ? "coming_soon" : (access?.status ?? "none")
              );
              const isCurrent = key === currentKey;
              const isPending = pendingKey === key;
              const onWaitlist =
                waitlisted.has(key) || access?.waitlisted === true;

              return (
                <li key={key}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isPending}
                    onClick={() =>
                      comingSoon
                        ? onWaitlist
                          ? undefined
                          : void notifyMe(key)
                        : void enterProduct(key)
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-slate-50 disabled:cursor-default"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        comingSoon
                          ? "bg-slate-100 text-slate-400"
                          : accessible
                            ? "bg-indigo-600 text-white"
                            : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {t(def.nameKey)}
                        </span>
                        {isCurrent && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        )}
                      </span>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                      >
                        {comingSoon && onWaitlist
                          ? t("auraHub.waitlisted")
                          : t(badge.key)}
                      </span>
                    </span>
                    {comingSoon && !onWaitlist && (
                      <span className="shrink-0 text-[11px] font-semibold text-indigo-600">
                        {t("auraHub.notifyMe")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-slate-100 p-1.5">
            <Link
              href="/select-product?stay=1"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              {t("auraHub.openHub")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

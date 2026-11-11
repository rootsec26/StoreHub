"use client";

import { Store, Clock } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/** Shown instead of the catalog when the store's StoreHub subscription is locked. */
export default function StoreUnavailable({ storeName }: { storeName: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-950">
          {t("storefront.unavailableTitle")}
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {t("storefront.unavailableBody", { name: storeName })}
        </p>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
          <Clock className="h-3.5 w-3.5" />
          {t("storefront.unavailableNote")}
        </p>
      </div>
    </div>
  );
}

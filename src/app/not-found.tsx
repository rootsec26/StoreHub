"use client";

import Link from "next/link";
import { Store } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Store className="h-16 w-16 text-slate-300" />
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
        404
      </p>
      <h1 className="text-2xl font-bold text-slate-900">
        {t("notFound.title")}
      </h1>
      <p className="max-w-md text-slate-600">{t("notFound.subtitle")}</p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        {t("store.goHome")}
      </Link>
    </div>
  );
}

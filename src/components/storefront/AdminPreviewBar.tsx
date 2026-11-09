"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function AdminPreviewBar() {
  const { t } = useI18n();

  return (
    <div className="sticky top-0 z-[70] flex items-center gap-2 bg-gradient-to-l from-indigo-600 via-indigo-700 to-purple-700 px-3 py-1.5 text-white shadow-md sm:gap-3 sm:px-4 sm:py-2">
      <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-indigo-200 sm:h-4 sm:w-4" />
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight sm:text-sm">
        {t("store.preview.title")}
        <span className="mx-1.5 hidden text-indigo-300 md:inline">•</span>
        <span className="hidden text-indigo-200 md:inline">
          {t("store.preview.badge")}
        </span>
      </p>
      <Link
        href="/dashboard"
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/25 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:text-xs"
      >
        {t("store.preview.back")}
        <ArrowRight className="h-3 w-3 rtl:-scale-x-100 sm:h-3.5 sm:w-3.5" />
      </Link>
    </div>
  );
}

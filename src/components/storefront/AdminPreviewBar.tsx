"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function AdminPreviewBar() {
  const { t } = useI18n();

  return (
    <div className="sticky top-0 z-[70] flex items-center justify-center gap-3 bg-gradient-to-l from-indigo-600 via-indigo-700 to-purple-700 px-4 py-2 text-white shadow-md">
      <LayoutDashboard className="h-4 w-4 shrink-0 text-indigo-200" />
      <p className="truncate text-xs font-semibold sm:text-sm">
        {t("store.preview.title")}
        <span className="mx-2 hidden text-indigo-300 sm:inline">•</span>
        <span className="hidden text-indigo-200 sm:inline">
          {t("store.preview.badge")}
        </span>
      </p>
      <Link
        href="/dashboard"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/25"
      >
        {t("store.preview.back")}
        <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
      </Link>
    </div>
  );
}

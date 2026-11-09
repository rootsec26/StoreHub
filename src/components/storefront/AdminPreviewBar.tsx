"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function AdminPreviewBar() {
  const { t } = useI18n();

  return (
    <Link
      href="/dashboard"
      title={t("store.preview.badge")}
      className="fixed bottom-4 end-4 z-[70] inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-900/30 transition-all hover:-translate-y-0.5 hover:bg-purple-700 hover:shadow-xl"
    >
      <LayoutDashboard className="h-4 w-4 shrink-0" />
      <span>{t("store.preview.back")}</span>
      <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
    </Link>
  );
}

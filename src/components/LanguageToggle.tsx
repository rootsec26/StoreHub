"use client";

import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { t, locale, toggleLocale } = useI18n();

  return (
    <button
      onClick={toggleLocale}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
      title={t("common.language")}
      aria-label={t("common.language")}
    >
      <Languages className="h-4 w-4" />
      {!compact && <span>{locale === "ar" ? "AR · العربية" : "EN · English"}</span>}
    </button>
  );
}

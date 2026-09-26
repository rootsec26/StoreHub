"use client";

import type { ReactNode } from "react";
import { Store } from "lucide-react";
import Link from "next/link";

import { useI18n } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="hidden w-1/2 items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 lg:flex">
        <div className="max-w-md text-center">
          <div className="mb-8 inline-flex items-center gap-3">
            <Store className="h-10 w-10 text-white" />
            <span className="text-3xl font-bold text-white">StoreHub</span>
          </div>
          <h2 className="mb-4 text-2xl font-bold text-white">
            {t("auth.heroTitle")}
          </h2>
          <p className="text-lg text-indigo-100">{t("auth.heroSubtitle")}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Store className="h-8 w-8 text-indigo-600" />
              <span className="text-2xl font-bold text-slate-900">
                Store<span className="text-indigo-600">Hub</span>
              </span>
            </div>
            <LanguageToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

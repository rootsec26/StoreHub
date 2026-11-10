"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Store } from "lucide-react";
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
          <Link
            href="/"
            aria-label="Back to home"
            className="group mb-6 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-md"
          >
            <ArrowLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:-scale-x-100" />
          </Link>
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

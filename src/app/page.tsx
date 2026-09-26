"use client";

import Link from "next/link";
import {
  Store,
  ShoppingCart,
  BarChart3,
  Users,
  ArrowRight,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

const FEATURES: {
  icon: typeof Store;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  bgClass: string;
  iconClass: string;
}[] = [
  {
    icon: Store,
    titleKey: "landing.feature.store.title",
    descKey: "landing.feature.store.desc",
    bgClass: "bg-indigo-100",
    iconClass: "text-indigo-600",
  },
  {
    icon: ShoppingCart,
    titleKey: "landing.feature.products.title",
    descKey: "landing.feature.products.desc",
    bgClass: "bg-emerald-100",
    iconClass: "text-emerald-600",
  },
  {
    icon: BarChart3,
    titleKey: "landing.feature.orders.title",
    descKey: "landing.feature.orders.desc",
    bgClass: "bg-amber-100",
    iconClass: "text-amber-600",
  },
  {
    icon: Users,
    titleKey: "landing.feature.checkout.title",
    descKey: "landing.feature.checkout.desc",
    bgClass: "bg-rose-100",
    iconClass: "text-rose-600",
  },
];

const STEPS: { titleKey: TranslationKey; descKey: TranslationKey }[] = [
  {
    titleKey: "landing.step1.title",
    descKey: "landing.step1.desc",
  },
  {
    titleKey: "landing.step2.title",
    descKey: "landing.step2.desc",
  },
  {
    titleKey: "landing.step3.title",
    descKey: "landing.step3.desc",
  },
];

export default function LandingPage() {
  const { t, formatNumber } = useI18n();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Store className="h-8 w-8 text-indigo-600" />
            <span className="text-2xl font-bold text-slate-900">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700">
              <Store className="h-4 w-4" />
              {t("landing.badge")}
            </div>
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              {t("landing.heroTitle")}
              <br />
              <span className="text-indigo-600">{t("landing.heroAccent")}</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-600">
              {t("landing.heroSubtitle")}
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
              >
                {t("landing.startSelling")}
                <ArrowRight className="h-5 w-5 rtl:rotate-180" />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("landing.learnMore")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-slate-900">
              {t("landing.featuresTitle")}
            </h2>
            <p className="text-lg text-slate-600">
              {t("landing.featuresSubtitle")}
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.titleKey}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`mb-4 inline-flex rounded-xl ${feature.bgClass} p-3`}
                >
                  <feature.icon
                    className={`h-6 w-6 ${feature.iconClass}`}
                  />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {t(feature.titleKey)}
                </h3>
                <p className="text-sm text-slate-600">
                  {t(feature.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-slate-900">
              {t("landing.howTitle")}
            </h2>
            <p className="text-lg text-slate-600">{t("landing.howSubtitle")}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((item, index) => (
              <div key={item.titleKey} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
                  {formatNumber(index + 1)}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {t(item.titleKey)}
                </h3>
                <p className="text-sm text-slate-600">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-3xl font-bold text-white">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mb-8 text-lg text-indigo-100">
            {t("landing.ctaSubtitle")}
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-600 shadow-lg hover:bg-indigo-50"
          >
            {t("landing.ctaButton")}
            <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-indigo-600" />
              <span className="text-lg font-bold text-slate-900">
                Store<span className="text-indigo-600">Hub</span>
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {t("landing.rights", {
                year: formatNumber(new Date().getFullYear()),
              })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

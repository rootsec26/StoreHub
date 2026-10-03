"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Store, Terminal } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

const FEATURES: {
  emoji: string;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  bgClass: string;
}[] = [
  {
    emoji: "🤖",
    titleKey: "landing.feature.ai.title",
    descKey: "landing.feature.ai.desc",
    bgClass: "bg-purple-50",
  },
  {
    emoji: "🛡️",
    titleKey: "landing.feature.whatsapp.title",
    descKey: "landing.feature.whatsapp.desc",
    bgClass: "bg-emerald-50",
  },
  {
    emoji: "🚚",
    titleKey: "landing.feature.shipping.title",
    descKey: "landing.feature.shipping.desc",
    bgClass: "bg-sky-50",
  },
  {
    emoji: "🎁",
    titleKey: "landing.feature.pos.title",
    descKey: "landing.feature.pos.desc",
    bgClass: "bg-amber-50",
  },
];

const PLANS: {
  nameKey: TranslationKey;
  priceKey: TranslationKey;
  descKey: TranslationKey;
  featureKeys: TranslationKey[];
  featured: boolean;
}[] = [
  {
    nameKey: "landing.plan.free.name",
    priceKey: "landing.plan.free.price",
    descKey: "landing.plan.free.desc",
    featureKeys: [
      "landing.plan.free.feature1",
      "landing.plan.free.feature2",
      "landing.plan.free.feature3",
    ],
    featured: false,
  },
  {
    nameKey: "landing.plan.pro.name",
    priceKey: "landing.plan.pro.price",
    descKey: "landing.plan.pro.desc",
    featureKeys: [
      "landing.plan.pro.feature1",
      "landing.plan.pro.feature2",
      "landing.plan.pro.feature3",
    ],
    featured: true,
  },
];

const FAQ: { questionKey: TranslationKey; answerKey: TranslationKey }[] = [
  { questionKey: "landing.faq.q1", answerKey: "landing.faq.a1" },
  { questionKey: "landing.faq.q2", answerKey: "landing.faq.a2" },
  { questionKey: "landing.faq.q3", answerKey: "landing.faq.a3" },
  { questionKey: "landing.faq.q4", answerKey: "landing.faq.a4" },
];

export default function LandingPage() {
  const { t, formatNumber } = useI18n();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Store className="h-7 w-7 text-indigo-600" />
            <span className="text-xl font-bold text-slate-900">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <a
              href="#features"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {t("nav.features")}
            </a>
            <a
              href="#pricing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {t("nav.pricing")}
            </a>
            <a
              href="#faq"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {t("nav.faq")}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle compact />
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 sm:px-4"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 sm:px-4"
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
            >
              {t("landing.ctaPrimary")}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-4 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t("landing.ctaSecondary")}
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.featuresSubtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.titleKey}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${feature.bgClass}`}
                >
                  <span role="img" aria-hidden="true">
                    {feature.emoji}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {t(feature.titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {t(feature.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.pricing.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.pricing.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {PLANS.map((plan) => (
              <div
                key={plan.nameKey}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 shadow-sm transition-shadow hover:shadow-md ${
                  plan.featured
                    ? "border-indigo-600 shadow-lg"
                    : "border-slate-200"
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 end-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                    {t("landing.pricing.popular")}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-slate-900">
                  {t(plan.nameKey)}
                </h3>
                <p className="mt-3 text-4xl font-extrabold text-slate-900">
                  {t(plan.priceKey)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {t(plan.descKey)}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.featureKeys.map((featureKey) => (
                    <li
                      key={featureKey}
                      className="flex items-start gap-2 text-sm text-slate-700"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{t(featureKey)}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-in"
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${
                    plan.featured
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {t("landing.plan.cta")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.faq.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.faq.subtitle")}
            </p>
          </div>

          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.questionKey}
                className="group rounded-2xl border border-slate-200 bg-white p-5 [&::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900">
                  {t(item.questionKey)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {t(item.answerKey)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-indigo-600 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            {t("landing.ctaSubtitle")}
          </p>
          <Link
            href="/sign-in"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-lg transition-colors hover:bg-indigo-50"
          >
            {t("landing.ctaButton")}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-indigo-600" />
            <span className="text-lg font-bold text-slate-900">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">تم التطوير بكل 🖤 بواسطة</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-purple-500/30 px-3 py-1 text-xs font-mono font-bold tracking-wider text-purple-400 transition-all duration-300 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:border-purple-500/50"
            >
              <Terminal className="w-3.5 h-3.5 text-purple-400" />
              rootsec
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {t("landing.rights", {
              year: formatNumber(new Date().getFullYear()),
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}

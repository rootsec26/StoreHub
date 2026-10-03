"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Store,
  ExternalLink,
  Bot,
  ShieldCheck,
  Truck,
  Gift,
  CreditCard,
  Wallet,
  Banknote,
  Smartphone,
  Barcode,
  Sparkles,
  Rocket,
  Clock,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

const FEATURES: {
  icon: typeof Bot;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  bgClass: string;
  iconColor: string;
}[] = [
  {
    icon: Bot,
    titleKey: "landing.feature.aiSocial.title",
    descKey: "landing.feature.aiSocial.desc",
    bgClass: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    icon: ShieldCheck,
    titleKey: "landing.feature.cod.title",
    descKey: "landing.feature.cod.desc",
    bgClass: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: Truck,
    titleKey: "landing.feature.shipping.title",
    descKey: "landing.feature.shipping.desc",
    bgClass: "bg-sky-50",
    iconColor: "text-sky-600",
  },
  {
    icon: Gift,
    titleKey: "landing.feature.pos.title",
    descKey: "landing.feature.pos.desc",
    bgClass: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    icon: CreditCard,
    titleKey: "landing.feature.payments.title",
    descKey: "landing.feature.payments.desc",
    bgClass: "bg-rose-50",
    iconColor: "text-rose-600",
  },
];

const PAYMENTS: {
  icon: typeof Wallet;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}[] = [
  {
    icon: Smartphone,
    titleKey: "landing.payments.vodafone.title",
    descKey: "landing.payments.vodafone.desc",
  },
  {
    icon: Banknote,
    titleKey: "landing.payments.instapay.title",
    descKey: "landing.payments.instapay.desc",
  },
  {
    icon: Wallet,
    titleKey: "landing.payments.cod.title",
    descKey: "landing.payments.cod.desc",
  },
  {
    icon: CreditCard,
    titleKey: "landing.payments.card.title",
    descKey: "landing.payments.card.desc",
  },
];

const STEPS: {
  icon: typeof Rocket;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}[] = [
  {
    icon: Store,
    titleKey: "landing.howItWorks.step1.title",
    descKey: "landing.howItWorks.step1.desc",
  },
  {
    icon: Barcode,
    titleKey: "landing.howItWorks.step2.title",
    descKey: "landing.howItWorks.step2.desc",
  },
  {
    icon: Rocket,
    titleKey: "landing.howItWorks.step3.title",
    descKey: "landing.howItWorks.step3.desc",
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
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
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
      <section className="relative overflow-hidden bg-gradient-to-bl from-indigo-50 via-white to-purple-50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <Sparkles className="h-4 w-4" />
            {t("landing.heroBadge")}
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-xl"
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

          {/* Value Highlights */}
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                emoji: "⚡",
                title: "أداء فائق وسرعة خاطفة",
                desc: "سرعة تحميل عالية للمتاجر وتجربة شراء سلسة للعملاء.",
              },
              {
                emoji: "🔒",
                title: "حماية وأمان A+",
                desc: "تشفير كامل للبيانات 256-bit AES-GCM وعزل تام للبيانات.",
              },
              {
                emoji: "📱",
                title: "دعم تجربة الموبايل 100%",
                desc: "تصميم متجاوب يعمل بكفاءة على كافة الشاشات والأجهزة.",
              },
            ].map((badge) => (
              <div
                key={badge.title}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/60 p-5 backdrop-blur-sm"
              >
                <span className="text-2xl leading-none">{badge.emoji}</span>
                <div>
                  <h3 className="mb-1 text-sm font-bold text-slate-900">
                    {badge.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    {badge.desc}
                  </p>
                </div>
              </div>
            ))}
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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.titleKey}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.bgClass}`}
                >
                  <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
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

      {/* Payments */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.payments.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.payments.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PAYMENTS.map((payment) => (
              <div
                key={payment.titleKey}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
                  <payment.icon className="h-7 w-7 text-indigo-600" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-slate-900">
                  {t(payment.titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {t(payment.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.howItWorks.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.titleKey} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                  <step.icon className="h-8 w-8" />
                </div>
                <div className="absolute -top-2 end-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                  {formatNumber(i + 1)}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  {t(step.titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  {t(step.descKey)}
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
      <section className="bg-gradient-to-bl from-indigo-600 to-purple-700 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Clock className="mx-auto mb-6 h-12 w-12 text-indigo-200" />
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            {t("landing.ctaSection.title")}
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            {t("landing.ctaSection.subtitle")}
          </p>
          <Link
            href="/sign-in"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-lg transition-all hover:bg-indigo-50 hover:shadow-xl"
          >
            {t("landing.ctaSection.button")}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-indigo-600" />
            <span className="text-lg font-bold text-slate-900">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 dir='rtl'">
            <span>تم التطوير بكل</span>
            <span className="text-base leading-none">💜</span>
            <span>بواسطة</span>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950 border border-slate-700 hover:border-purple-500 text-slate-200 hover:text-white text-xs md:text-sm font-mono shadow-md hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all duration-300">
              <a href="https://github.com/rootsec26" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <span className="font-medium">GitHub</span>
              </a>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/50 hover:border-purple-400 text-purple-200 hover:text-white text-xs md:text-sm font-medium shadow-md hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-300">
              <a href="https://rootsec26.vercel.app/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-purple-400" />
                <span className="font-medium">معرض الأعمال</span>
              </a>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            {t("landing.rights", {
              year: formatNumber(new Date().getFullYear()),
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}

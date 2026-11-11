"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
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
  Download,
  Laptop,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { ANDROID_APK_URL } from "@/lib/app-download";
import { isFreeMode } from "@/lib/free-mode";
import { isNativeAppShell } from "@/lib/platform";
import LanguageToggle from "@/components/LanguageToggle";
import TopStoresShowcase from "@/components/landing/TopStoresShowcase";
import PlatformFeed from "@/components/platform/PlatformFeed";

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

const NAV_LINKS: [string, TranslationKey][] = [
  ["#features", "nav.features"],
  ["#top-stores", "nav.topStores"],
  ["#pricing", "nav.pricing"],
  ["#faq", "nav.faq"],
];

export default function LandingPage() {
  const { t, formatNumber } = useI18n();
  const [logoTapped, setLogoTapped] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const isNativeApp = useSyncExternalStore(
    () => () => {},
    isNativeAppShell,
    () => false
  );

  // Reveal the discreet super-admin shortcut only for the configured
  // ADMIN_EMAIL session — the flag is computed server-side in /api/auth/me.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { isAdmin?: boolean } | null) => {
        if (!cancelled && data?.isAdmin) setIsSuperAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200 transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/logo-transparent.png"
                alt="StoreHub"
                fill
                sizes="40px"
                className="object-contain p-1"
              />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50/80 p-1.5 lg:flex">
            {NAV_LINKS.map(([href, labelKey]) => (
              <a
                key={href}
                href={href}
                className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-950 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {t(labelKey)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Link
                href="/admin"
                title="Super Admin"
                aria-label="Super Admin panel"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <ShieldCheck className="h-5 w-5" />
              </Link>
            )}
            <LanguageToggle compact />
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-4"
            >
              {t("landing.signIn")}
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-11 items-center rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:px-5"
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>

        {/* Mobile nav — horizontally scrollable pill strip */}
        <nav
          aria-label="Mobile navigation"
          className="border-t border-slate-200/70 bg-white/85 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_LINKS.map(([href, labelKey]) => (
              <a
                key={href}
                href={href}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-950 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {t(labelKey)}
              </a>
            ))}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.18),transparent_42%),radial-gradient(ellipse_at_top_right,_rgba(124,58,237,0.16),transparent_38%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
          <div className="group relative mx-auto mb-10 flex h-56 w-full max-w-sm flex-col items-center justify-center sm:mb-12 sm:h-64">
            <div className="absolute inset-x-2 inset-y-0 animate-logo-glow rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.28),rgba(59,130,246,0.16)_45%,transparent_72%)] blur-3xl" />
            <button
              type="button"
              onClick={() => setLogoTapped((tapped) => !tapped)}
              aria-label="StoreHub logo"
              aria-pressed={logoTapped}
              className="relative flex w-full flex-1 cursor-pointer items-center justify-center rounded-3xl outline-none transition-transform duration-500 focus-visible:ring-4 focus-visible:ring-indigo-200"
            >
              <div className="animate-logo-float flex h-full w-full items-center justify-center">
                <Image
                  src="/hero-logo.png"
                  alt=""
                  width={559}
                  height={416}
                  priority
                  sizes="(max-width: 640px) 224px, 288px"
                  className="h-auto w-full max-w-[280px] object-contain drop-shadow-[0_24px_35px_rgba(99,102,241,0.22)] transition-transform duration-500 group-hover:scale-[1.03] sm:max-w-[320px]"
                />
              </div>
            </button>
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-2 whitespace-nowrap rounded-full border border-indigo-100 bg-white/95 px-5 py-2 text-2xl font-extrabold tracking-tight text-slate-950 shadow-lg shadow-indigo-100/60 backdrop-blur transition-all duration-500 ease-out sm:text-3xl ${
                logoTapped
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
              }`}
            >
              Store<span className="text-indigo-600">Hub</span>
            </div>
          </div>
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-4 py-1.5 text-sm font-bold text-blue-700 shadow-sm shadow-blue-100/60 backdrop-blur">
            <Sparkles className="h-4 w-4 text-blue-500" />
            {t("landing.heroBadge")}
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
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

      {/* App Download Hub */}
      <section className="relative overflow-hidden bg-gradient-to-l from-indigo-600 via-indigo-700 to-purple-800 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)]" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          {isNativeApp ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <Check className="h-8 w-8 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                  {t("landing.app.inAppTitle")}
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-lg text-indigo-100">
                  {t("landing.app.inAppSubtitle")}
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-indigo-700 shadow-xl shadow-indigo-950/30 transition-all hover:-translate-y-0.5 hover:bg-indigo-50"
              >
                {t("landing.app.openDashboard")}
                <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
              </Link>
            </div>
          ) : (
            <>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-bold text-indigo-100">
              <Download className="h-4 w-4" />
              {t("landing.app.badge")}
            </span>
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              {t("landing.app.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-indigo-100">
              {t("landing.app.subtitle")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Android */}
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-7 text-center backdrop-blur">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Smartphone className="h-7 w-7 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Android</h3>
                <p className="mt-1 text-sm text-indigo-100">
                  {t("landing.app.note")}
                </p>
              </div>
              <a
                href={ANDROID_APK_URL}
                download="storehub.apk"
                className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-indigo-700 shadow-xl shadow-indigo-950/30 transition-all hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-2xl"
              >
                <Download className="h-5 w-5" />
                {t("landing.app.button")}
              </a>
            </div>

            {/* Windows */}
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-7 text-center backdrop-blur">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Laptop className="h-7 w-7 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Windows</h3>
                <p className="mt-1 text-sm text-indigo-100">
                  {t("landing.app.windows.note")}
                </p>
              </div>
              <a
                href="https://github.com/rootsec26/StoreHub/releases/download/v0.1.5/StoreHub_0.1.5_x64-setup.exe"
                className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-indigo-700 shadow-xl shadow-indigo-950/30 transition-all hover:-translate-y-0.5 hover:bg-indigo-50 hover:shadow-2xl"
              >
                <Download className="h-5 w-5" />
                {t("landing.app.windows.button")}
              </a>
            </div>
          </div>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-36 lg:scroll-mt-20 bg-white py-20">
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

      {/* Platform feed — official StoreHub updates & announcements */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <PlatformFeed compact />
        </div>
      </section>

      {/* Top Rated Stores */}
      <TopStoresShowcase />

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
      <section id="pricing" className="scroll-mt-36 lg:scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.pricing.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.pricing.subtitle")}
            </p>
          </div>

          {isFreeMode() ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center shadow-sm">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4" />
                {t("landing.pricing.free.badge")}
              </span>
              <h3 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                {t("landing.pricing.free.title")}
              </h3>
              <p className="mt-3 text-lg text-slate-600">
                {t("landing.pricing.free.desc")}
              </p>
              <Link
                href="/sign-in"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                {t("landing.plan.cta")}
              </Link>
            </div>
          ) : (
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
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-36 lg:scroll-mt-20 bg-white py-20">
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
      <footer className="border-t border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7 overflow-hidden rounded-lg">
              <Image
                src="/logo-transparent.png"
                alt="StoreHub"
                fill
                sizes="28px"
                className="object-contain"
              />
            </div>
            <span className="text-lg font-bold text-white">
              Store<span className="text-indigo-400">Hub</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="text-sm text-slate-300">تم التطوير بكل</span>
            <span className="text-base leading-none">💜</span>
            <span className="text-sm text-slate-300">بواسطة</span>
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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/50 hover:border-emerald-400 text-emerald-200 hover:text-white text-xs md:text-sm font-medium shadow-md hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-300">
              <a href="https://wa.me/201065592701" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                <span className="font-medium">واتساب</span>
              </a>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-950/60 border border-sky-500/50 hover:border-sky-400 text-sky-200 hover:text-white text-xs md:text-sm font-medium shadow-md hover:shadow-[0_0_15px_rgba(56,189,248,0.4)] transition-all duration-300">
              <a href="https://t.me/rootsec26" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-sky-400" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                <span className="font-medium">تليجرام</span>
              </a>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            {t("landing.rights", {
              year: formatNumber(new Date().getFullYear()),
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}

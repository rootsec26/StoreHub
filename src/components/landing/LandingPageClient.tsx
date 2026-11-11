"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  GraduationCap,
  Layers,
  Network,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";
import AuthEntryLink from "@/components/products/AuthEntryLink";

const NAV_LINKS: [string, TranslationKey][] = [
  ["#products", "nav.products"],
  ["#features", "nav.features"],
  ["#about", "nav.about"],
  ["#pricing", "nav.pricingGeneral"],
  ["#faq", "nav.faq"],
];

const PRODUCTS: {
  nameKey: TranslationKey;
  taglineKey: TranslationKey;
  descKey: TranslationKey;
  icon: typeof Store;
  href?: string;
  ctaKey?: TranslationKey;
  active?: boolean;
  /** Routes through the session-aware Aura Hub entry (/select-product). */
  authEntry?: boolean;
}[] = [
  {
    nameKey: "landing.product.storehub.name",
    taglineKey: "landing.product.storehub.tagline",
    descKey: "landing.product.storehub.description",
    icon: Store,
    ctaKey: "landing.product.storehub.cta",
    active: true,
    authEntry: true,
  },
  {
    nameKey: "landing.product.academy.name",
    taglineKey: "landing.product.academy.tagline",
    descKey: "landing.product.academy.description",
    icon: GraduationCap,
  },
  {
    nameKey: "landing.product.future.name",
    taglineKey: "landing.product.future.tagline",
    descKey: "landing.product.future.description",
    icon: Layers,
  },
];

const AURA_FEATURES: {
  icon: typeof Rocket;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}[] = [
  {
    icon: Rocket,
    titleKey: "landing.auraFeature1.title",
    descKey: "landing.auraFeature1.desc",
  },
  {
    icon: Network,
    titleKey: "landing.auraFeature2.title",
    descKey: "landing.auraFeature2.desc",
  },
  {
    icon: ShieldCheck,
    titleKey: "landing.auraFeature3.title",
    descKey: "landing.auraFeature3.desc",
  },
  {
    icon: Bot,
    titleKey: "landing.auraFeature4.title",
    descKey: "landing.auraFeature4.desc",
  },
];

const ABOUT_POINTS: TranslationKey[] = [
  "landing.about.point1",
  "landing.about.point2",
  "landing.about.point3",
];

const FAQ: { questionKey: TranslationKey; answerKey: TranslationKey }[] = [
  { questionKey: "landing.auraFaq.q1", answerKey: "landing.auraFaq.a1" },
  { questionKey: "landing.auraFaq.q2", answerKey: "landing.auraFaq.a2" },
  { questionKey: "landing.auraFaq.q3", answerKey: "landing.auraFaq.a3" },
  { questionKey: "landing.auraFaq.q4", answerKey: "landing.auraFaq.a4" },
];

export default function LandingPage() {
  const { t, formatNumber } = useI18n();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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
            <Image
              src="/Aura.jpeg"
              alt="Aura"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200 transition-transform duration-300 group-hover:scale-105"
            />
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent sm:text-2xl">
              Aura
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
            <a
              href="#products"
              className="inline-flex h-11 items-center rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:px-5"
            >
              {t("landing.aura.navCta")}
            </a>
            <AuthEntryLink className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-4">
              {t("landing.signIn")}
            </AuthEntryLink>
          </div>
        </div>

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

      {/* Aura hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.18),transparent_42%),radial-gradient(ellipse_at_top_right,_rgba(124,58,237,0.16),transparent_38%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
          <div className="relative mx-auto mb-12 flex flex-col items-center">
            <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.24),rgba(14,165,233,0.12)_55%,transparent_75%)] blur-3xl" />
            <Image
              src="/Aura.jpeg"
              alt="Aura"
              width={192}
              height={192}
              priority
              className="h-40 w-40 rounded-[2rem] object-cover shadow-2xl shadow-indigo-500/20 ring-1 ring-slate-200 sm:h-48 sm:w-48"
            />
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {PRODUCTS.map((product) => {
                const Icon = product.icon;
                return (
                  <div
                    key={product.nameKey}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur"
                  >
                    <Icon className="h-4 w-4 text-indigo-600" />
                    {t(product.nameKey)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-4 py-1.5 text-sm font-bold text-blue-700 shadow-sm shadow-blue-100/60 backdrop-blur">
            <Sparkles className="h-4 w-4 text-blue-500" />
            {t("landing.aura.badge")}
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
            {t("landing.aura.title")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            {t("landing.aura.subtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#products"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-xl"
            >
              {t("landing.aura.ctaPrimary")}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-4 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t("landing.aura.ctaSecondary")}
            </a>
          </div>
        </div>
      </section>

      {/* Aura product selection */}
      <section
        id="products"
        className="scroll-mt-36 bg-slate-50 py-20 lg:scroll-mt-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.products.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.products.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {PRODUCTS.map((product) => {
              const Icon = product.icon;
              const active = Boolean(product.active);

              return (
                <article
                  key={product.nameKey}
                  className={`flex h-full flex-col rounded-3xl border p-6 shadow-sm transition-all ${
                    active
                      ? "border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-white shadow-lg shadow-indigo-100/60"
                      : "border-slate-200 bg-white opacity-90"
                  }`}
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                        active
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
                        active
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                      }`}
                    >
                      {t(
                        active
                          ? "landing.products.available"
                          : "landing.products.comingSoon"
                      )}
                    </span>
                  </div>

                  <h3 className="text-xl font-extrabold tracking-tight text-slate-950">
                    {t(product.nameKey)}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-indigo-600">
                    {t(product.taglineKey)}
                  </p>
                  <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">
                    {t(product.descKey)}
                  </p>

                  <div className="mt-6">
                    {product.authEntry && product.ctaKey ? (
                      <AuthEntryLink className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-700">
                        {t(product.ctaKey)}
                        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                      </AuthEntryLink>
                    ) : product.href && product.ctaKey ? (
                      <Link
                        href={product.href}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
                      >
                        {t(product.ctaKey)}
                        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-400 ring-1 ring-slate-200"
                      >
                        {t("landing.products.comingSoon")}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Aura capabilities */}
      <section id="features" className="scroll-mt-36 bg-white py-20 lg:scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.auraFeatures.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.auraFeatures.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AURA_FEATURES.map((feature) => (
              <div
                key={feature.titleKey}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
                  <feature.icon className="h-6 w-6 text-indigo-600" />
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

      {/* About Aura */}
      <section id="about" className="scroll-mt-36 bg-slate-50 py-20 lg:scroll-mt-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative mx-auto flex h-72 w-full max-w-sm items-center justify-center">
            <div className="absolute inset-0 rounded-[2.5rem] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.22),rgba(14,165,233,0.12)_55%,transparent_75%)] blur-3xl" />
            <Image
              src="/Aura.jpeg"
              alt="Aura"
              width={224}
              height={224}
              className="relative h-56 w-56 rounded-[2rem] object-cover shadow-2xl shadow-indigo-500/15 ring-1 ring-slate-200"
            />
          </div>

          <div>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.about.title")}
            </h2>
            <p className="mt-2 text-lg font-semibold text-indigo-600">
              {t("landing.about.subtitle")}
            </p>
            <p className="mt-5 text-base leading-8 text-slate-600">
              {t("landing.about.p1")}
            </p>
            <p className="mt-4 text-base leading-8 text-slate-600">
              {t("landing.about.p2")}
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {ABOUT_POINTS.map((pointKey) => (
                <li
                  key={pointKey}
                  className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{t(pointKey)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* General pricing */}
      <section id="pricing" className="scroll-mt-36 bg-white py-20 lg:scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.auraPricing.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.auraPricing.subtitle")}
            </p>
          </div>

          <div className="rounded-3xl border border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-white p-8 text-center shadow-lg shadow-indigo-100/60">
            <h3 className="text-2xl font-extrabold tracking-tight text-slate-950">
              {t("landing.auraPricing.cardTitle")}
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-slate-600">
              {t("landing.auraPricing.cardDesc")}
            </p>
            <a
              href="#products"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
            >
              {t("landing.auraPricing.cta")}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-36 bg-slate-50 py-20 lg:scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              {t("landing.auraFaq.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              {t("landing.auraFaq.subtitle")}
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

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/Aura.jpeg"
              alt="Aura"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-cover ring-1 ring-slate-700"
            />
            <div>
              <span className="text-lg font-bold text-white">Aura</span>
              <p className="text-xs text-slate-400">
                {t("landing.footer.ecosystem")}
              </p>
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

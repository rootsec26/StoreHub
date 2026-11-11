"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

import PlatformFeed from "@/components/platform/PlatformFeed";
import { useI18n } from "@/lib/i18n";

/**
 * Dedicated platform updates page — the full StoreHub announcement feed.
 * Linked from the compact card on the landing page ("View all updates").
 */
export default function PlatformFeedPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative h-9 w-9 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 shadow-sm">
              <Image
                src="/logo-transparent.png"
                alt="StoreHub"
                fill
                sizes="36px"
                className="object-contain p-1"
              />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-950">
              Store<span className="text-indigo-600">Hub</span>
            </span>
          </Link>
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            {t("platform.backHome")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PlatformFeed />
      </main>
    </div>
  );
}

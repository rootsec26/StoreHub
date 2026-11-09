"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Crown, Store, Star } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { accentGradient, normalizeAccent } from "@/lib/theme";

interface TopStore {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  accentColor: string;
  average: number;
  count: number;
}

const MEDAL_CLASSES = [
  "ring-amber-400",
  "ring-slate-300",
  "ring-amber-600",
];

/**
 * Landing-page showcase of the highest-rated storefronts. Renders nothing
 * when no store has reviews yet so the section never looks broken.
 */
export default function TopStoresShowcase() {
  const { t, formatNumber } = useI18n();
  const [stores, setStores] = useState<TopStore[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/storefront/top-stores", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stores?: TopStore[] } | null) => {
        if (!cancelled && data?.stores) setStores(data.stores);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (stores.length === 0) return null;

  return (
    <section id="top-stores" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-700">
            <Crown className="h-4 w-4" />
            {t("landing.topStores.badge")}
          </span>
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {t("landing.topStores.title")}
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            {t("landing.topStores.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {stores.map((store, index) => {
            const accent = normalizeAccent(store.accentColor);
            const logoValid = isValidImageUrl(store.logoUrl);
            return (
              <Link
                key={store.id}
                href={`/store/${store.slug}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/60"
              >
                <div className="relative">
                  <div
                    className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-4 transition-transform duration-300 group-hover:scale-105 ${
                      index < 3 ? MEDAL_CLASSES[index] : "ring-slate-100"
                    }`}
                    style={
                      logoValid
                        ? undefined
                        : { backgroundImage: accentGradient(accent) }
                    }
                  >
                    {logoValid ? (
                      <Image
                        src={store.logoUrl}
                        alt={store.name}
                        fill
                        sizes="80px"
                        unoptimized={!canOptimizeImage(store.logoUrl)}
                        className="object-cover"
                      />
                    ) : (
                      <Store className="h-9 w-9 text-slate-400" />
                    )}
                  </div>
                  {index === 0 && (
                    <span className="absolute -top-1.5 -end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[11px] font-black text-white shadow">
                      1
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600">
                    {store.name}
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-amber-500" dir="ltr">
                    <Star className="h-3.5 w-3.5 fill-amber-400" />
                    {store.average.toFixed(1)}
                    <span className="font-normal text-slate-400">
                      ({formatNumber(store.count)})
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

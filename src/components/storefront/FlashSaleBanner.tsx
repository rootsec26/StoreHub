"use client";

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useNow, useStorePromotions } from "@/lib/promotions-hooks";
import {
  formatCountdown,
  promotionState,
  type PromotionRecord,
} from "@/lib/promotions";

interface FlashSaleBannerProps {
  slug: string;
  initialPromotions?: PromotionRecord[] | null;
}

/**
 * Sticky top banner for `/store/[slug]`. Queries the store's active campaigns,
 * advertises the current (or next) flash sale with its discount and a live
 * ticking countdown, and publishes its own height through `--flash-banner-h`
 * so the sticky search bar underneath stays visible.
 */
export default function FlashSaleBanner({
  slug,
  initialPromotions,
}: FlashSaleBannerProps) {
  const { t } = useI18n();
  const now = useNow();
  const promotions = useStorePromotions(slug, initialPromotions);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // The public endpoint already returns active campaigns with an end time in
  // the future; ordering by start time makes the first candidate the live one
  // whenever any campaign is running.
  const candidate = promotions
    .filter((promotion) => promotion.showBanner !== false)
    .filter((promotion) =>
      now === null ? true : promotionState(promotion, now) !== "ended"
    )
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
  const candidateId = candidate?.id ?? null;

  const state =
    candidate && now !== null ? promotionState(candidate, now) : null;
  const remaining =
    candidate && now !== null
      ? Date.parse(state === "live" ? candidate.endTime : candidate.startTime) -
        now
      : null;

  // Publish the banner height so the sticky filter bar sits right below it.
  useEffect(() => {
    const root = document.documentElement;
    const element = bannerRef.current;
    if (!element) {
      root.style.setProperty("--flash-banner-h", "0px");
      return;
    }
    const update = () =>
      root.style.setProperty("--flash-banner-h", `${element.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.setProperty("--flash-banner-h", "0px");
    };
  }, [candidateId]);

  if (!candidate) return null;

  const bannerText = candidate.bannerText?.trim();

  return (
    <div
      ref={bannerRef}
      className="sticky top-0 z-40 bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 text-white shadow-md"
      role="region"
      aria-label={t("store.flash.sale")}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Zap className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="truncate text-sm font-bold">{candidate.title}</span>
          <span className="shrink-0 rounded bg-white/25 px-2 py-0.5 text-[11px] font-bold tabular-nums">
            {t("store.flash.off", { percent: candidate.discountPercentage })}
          </span>
          {bannerText && (
            <span className="hidden truncate text-xs text-white/85 sm:inline">
              {bannerText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-white/85">
            {state === "live"
              ? t("store.flash.endsIn")
              : state === "upcoming"
                ? t("store.flash.startsIn")
                : t("store.flash.sale")}
          </span>
          <span
            className="rounded bg-black/25 px-2 py-1 text-sm font-bold tabular-nums"
            dir="ltr"
          >
            {remaining !== null
              ? formatCountdown(remaining)
              : "--d : --h : --m : --s"}
          </span>
        </div>
      </div>
    </div>
  );
}

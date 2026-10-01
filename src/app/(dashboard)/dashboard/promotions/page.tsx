"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Ticket,
  Percent,
  DollarSign,
  Timer,
  Trophy,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock3,
  Loader2,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useNow } from "@/lib/promotions-hooks";
import {
  couponStatus,
  formatCountdown,
  generateCouponCode,
  promotionState,
  toDateTimeLocalValue,
  type CouponRecord,
  type PromotionRecord,
} from "@/lib/promotions";

interface ProductOption {
  id: string;
  name: string;
  price: string;
  categoryId: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface CouponStats {
  revenue: string;
  redemptions: number;
  activeCount: number;
  topCodes: { code: string; timesUsed: number }[];
}

type TargetMode = "all" | "products" | "categories";

const PROMO_STATUS_LABEL: Record<string, TranslationKey> = {
  live: "promos.status.live",
  upcoming: "promos.status.scheduled",
  ended: "promos.status.ended",
  paused: "promos.status.paused",
};

const PROMO_STATUS_CLASS: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-700",
  upcoming: "bg-blue-100 text-blue-700",
  ended: "bg-slate-100 text-slate-600",
  paused: "bg-amber-100 text-amber-700",
};

const COUPON_STATUS_LABEL: Record<string, TranslationKey> = {
  active: "promos.coupons.status.active",
  expired: "promos.coupons.status.expired",
  exhausted: "promos.coupons.status.exhausted",
};

const COUPON_STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-slate-100 text-slate-600",
  exhausted: "bg-rose-100 text-rose-700",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

function defaultStart(): string {
  return toDateTimeLocalValue(new Date());
}

function defaultEnd(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

/** Ticking preview of the storefront banner while building a campaign. */
function BannerPreview({
  title,
  discount,
  startTime,
  endTime,
  bannerText,
}: {
  title: string;
  discount: string;
  startTime: string;
  endTime: string;
  bannerText: string;
}) {
  const { t } = useI18n();
  const now = useNow();

  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const valid = !Number.isNaN(start) && !Number.isNaN(end) && end > start;
  const upcoming = valid && now !== null && now < start;
  const live = valid && now !== null && now >= start && now < end;
  const target = upcoming ? start : end;
  const remaining =
    now === null || !valid ? null : formatCountdown(target - now);

  return (
    <div className="overflow-hidden rounded-lg bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 px-4 py-3 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm font-bold">
              {title.trim() || t("promos.field.titlePlaceholder")}
            </span>
            {Number(discount) > 0 && (
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">
                {t("store.flash.off", { percent: Math.round(Number(discount)) })}
              </span>
            )}
          </div>
          {bannerText.trim() && (
            <p className="mt-0.5 truncate text-xs text-white/80">
              {bannerText.trim()}
            </p>
          )}
        </div>
        <div className="text-sm font-bold tabular-nums" dir="ltr">
          {remaining ?? "--d : --h : --m : --s"}
        </div>
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/70">
        {now !== null && valid
          ? upcoming
            ? t("promos.preview.startsIn")
            : t("promos.preview.endsIn")
          : t("promos.preview")}
      </p>
    </div>
  );
}

export default function PromotionsPage() {
  const { t, formatMoney, formatDateTime, formatNumber } = useI18n();
  const now = useNow();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [stats, setStats] = useState<CouponStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<string | null>(null);

  // Flash sale builder
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState("30");
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [bannerText, setBannerText] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [creatingPromo, setCreatingPromo] = useState(false);

  // Coupon generator
  const [code, setCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("");
  const [minSpend, setMinSpend] = useState("0");
  const [maxUses, setMaxUses] = useState("50");
  const [expiresAt, setExpiresAt] = useState("");
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [productsRes, categoriesRes, promotionsRes, couponsRes] =
          await Promise.all([
            fetch("/api/products"),
            fetch("/api/categories"),
            fetch("/api/promotions"),
            fetch("/api/coupons"),
          ]);

        const productsPayload = productsRes.ok
          ? await productsRes.json()
          : { products: [] };
        const categoriesPayload = categoriesRes.ok
          ? await categoriesRes.json()
          : { categories: [] };
        const promotionsPayload = promotionsRes.ok
          ? await promotionsRes.json()
          : { promotions: [] };
        const couponsPayload = couponsRes.ok
          ? await couponsRes.json()
          : { coupons: [], stats: null };

        if (cancelled) return;

        setProducts(productsPayload.products ?? []);
        setCategories(categoriesPayload.categories ?? []);
        setPromotions(promotionsPayload.promotions ?? []);
        setCoupons(couponsPayload.coupons ?? []);
        setStats(couponsPayload.stats ?? null);
      } catch {
        if (!cancelled) showToast(t("promos.toast.createFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function toggleProduct(id: string) {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  async function handleCreatePromotion(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      showToast(t("promos.error.titleRequired"));
      return;
    }
    const discountValue = Number(discount);
    if (!Number.isFinite(discountValue) || discountValue < 1 || discountValue > 100) {
      showToast(t("promos.error.discountRange"));
      return;
    }
    const start = Date.parse(startTime);
    const end = Date.parse(endTime);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      showToast(t("promos.error.dates"));
      return;
    }
    if (targetMode === "products" && selectedProductIds.length === 0) {
      showToast(t("promos.error.selectTargets"));
      return;
    }
    if (targetMode === "categories" && selectedCategoryIds.length === 0) {
      showToast(t("promos.error.selectTargets"));
      return;
    }

    setCreatingPromo(true);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          discountPercentage: Math.round(discountValue),
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
          bannerText,
          showBanner,
          targetProductIds:
            targetMode === "products" ? selectedProductIds : [],
          targetCategoryIds:
            targetMode === "categories" ? selectedCategoryIds : [],
        }),
      });

      if (!res.ok) throw new Error("create failed");

      const payload = (await res.json()) as { promotion: PromotionRecord };
      setPromotions((current) =>
        [...current, payload.promotion].sort(
          (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)
        )
      );
      setTitle("");
      setBannerText("");
      showToast(t("promos.toast.created"));
    } catch {
      showToast(t("promos.toast.createFailed"));
    } finally {
      setCreatingPromo(false);
    }
  }

  async function togglePromotion(promotion: PromotionRecord) {
    try {
      const res = await fetch("/api/promotions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: promotion.id, isActive: !promotion.isActive }),
      });
      if (!res.ok) throw new Error("update failed");

      const payload = (await res.json()) as { promotion: PromotionRecord };
      setPromotions((current) =>
        current.map((entry) =>
          entry.id === payload.promotion.id ? payload.promotion : entry
        )
      );
      showToast(t("promos.toast.updated"));
    } catch {
      showToast(t("promos.toast.updateFailed"));
    }
  }

  async function deletePromotion(promotion: PromotionRecord) {
    if (!window.confirm(t("promos.list.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/promotions?id=${promotion.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      setPromotions((current) =>
        current.filter((entry) => entry.id !== promotion.id)
      );
      showToast(t("promos.toast.deleted"));
    } catch {
      showToast(t("promos.toast.deleteFailed"));
    }
  }

  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault();

    if (!code.trim()) {
      showToast(t("promos.error.codeRequired"));
      return;
    }
    const discountValue = Number(couponDiscount);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      showToast(t("promos.error.positiveDiscount"));
      return;
    }

    setCreatingCoupon(true);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountAmount: discountValue,
          minSpend: Number(minSpend) || 0,
          maxUses: Number(maxUses) || 1,
          expiresAt: expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
        }),
      });

      if (!res.ok) throw new Error("create failed");

      const payload = (await res.json()) as { coupon: CouponRecord };
      setCoupons((current) => [payload.coupon, ...current]);
      setCode(generateCouponCode(discountValue));
      showToast(t("promos.toast.couponCreated"));
      refreshStats();
    } catch {
      showToast(t("promos.toast.couponCreateFailed"));
    } finally {
      setCreatingCoupon(false);
    }
  }

  async function deleteCoupon(coupon: CouponRecord) {
    if (!window.confirm(t("promos.coupons.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/coupons?id=${coupon.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      setCoupons((current) => current.filter((entry) => entry.id !== coupon.id));
      showToast(t("promos.toast.couponDeleted"));
      refreshStats();
    } catch {
      showToast(t("promos.toast.couponDeleteFailed"));
    }
  }

  async function refreshStats() {
    try {
      const res = await fetch("/api/coupons");
      if (!res.ok) return;
      const payload = (await res.json()) as {
        coupons?: CouponRecord[];
        stats?: CouponStats;
      };
      if (payload.stats) setStats(payload.stats);
      if (payload.coupons) setCoupons(payload.coupons);
    } catch {
      // Stats refresh is best-effort.
    }
  }

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(value);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  // `now` is null only during SSR/first paint; every consumer below renders
  // after the fetch resolves (post-mount), so the zero fallback never surfaces.
  const timestamp = now ?? 0;
  const livePromotion = promotions.find(
    (promotion) => promotionState(promotion, timestamp) === "live"
  );

  const performanceCards = [
    {
      label: t("promos.card.couponRevenue"),
      value: formatMoney(stats?.revenue ?? "0"),
      sub:
        stats && stats.redemptions > 0
          ? t("promos.card.redemptionCount", {
              count: formatNumber(stats.redemptions),
            })
          : t("promos.card.noRedemptions"),
      icon: DollarSign,
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: t("promos.card.flashStatus"),
      value: livePromotion
        ? livePromotion.title
        : t("promos.card.noActive"),
      sub:
        livePromotion && now !== null
          ? formatCountdown(Date.parse(livePromotion.endTime) - now)
          : livePromotion
            ? "--d : --h : --m : --s"
            : t("promos.status.live") + " —",
      icon: Timer,
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
    {
      label: t("promos.card.topCodes"),
      value:
        stats && stats.topCodes.length > 0
          ? stats.topCodes[0].code
          : t("promos.card.noRedemptions"),
      sub:
        stats && stats.topCodes.length > 0
          ? stats.topCodes
              .map((entry) => `${entry.code} · ${entry.timesUsed}`)
              .join("   ")
          : t("promos.card.topCodes"),
      icon: Trophy,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
    },
  ];

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <p className="mb-6 text-sm text-slate-500">{t("promos.subtitle")}</p>

      {/* Campaign performance */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="mt-3 h-8 w-32 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-40 rounded bg-slate-200" />
              </div>
            ))
          : performanceCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-600">
                    {card.label}
                  </p>
                  <div className={`rounded-lg ${card.bgColor} p-2`}>
                    <card.icon className={`h-4 w-4 ${card.textColor}`} />
                  </div>
                </div>
                <p className="mt-2 truncate text-2xl font-bold text-slate-900">
                  {card.value}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500" dir="auto">
                  {card.sub}
                </p>
              </div>
            ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Flash Sale Builder */}
        <form
          onSubmit={handleCreatePromotion}
          className="rounded-xl bg-white p-6 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-rose-50 p-2">
              <Zap className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("promos.builder.title")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("promos.builder.subtitle")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>{t("promos.field.title")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("promos.field.titlePlaceholder")}
                className={inputClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>{t("promos.field.discount")}</label>
                <div className="relative">
                  <Percent className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className={`${inputClass} pe-9`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t("promos.field.start")}</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("promos.field.end")}</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t("promos.field.bannerText")}</label>
              <input
                type="text"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder={t("promos.field.bannerTextPlaceholder")}
                className={inputClass}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <input
                type="checkbox"
                checked={showBanner}
                onChange={(e) => setShowBanner(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700">
                {t("promos.field.showBanner")}
              </span>
            </label>

            <div>
              <label className={labelClass}>{t("promos.field.targets")}</label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "promos.target.all"],
                    ["products", "promos.target.products"],
                    ["categories", "promos.target.categories"],
                  ] as [TargetMode, TranslationKey][]
                ).map(([mode, labelKey]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTargetMode(mode)}
                    aria-pressed={targetMode === mode}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      targetMode === mode
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {targetMode === "products" && (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  {products.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-slate-500">
                      {t("promos.target.selectProducts")}
                    </p>
                  ) : (
                    products.map((product) => (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 truncate text-slate-700">
                          {product.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatMoney(product.price)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}

              {targetMode === "categories" && (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  {categories.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-slate-500">
                      {t("promos.target.selectCategories")}
                    </p>
                  ) : (
                    categories.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCategoryIds.includes(category.id)}
                          onChange={() => toggleCategory(category.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 truncate text-slate-700">
                          {category.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("promos.preview")}
              </p>
              <BannerPreview
                title={title}
                discount={discount}
                startTime={startTime}
                endTime={endTime}
                bannerText={bannerText}
              />
            </div>

            <button
              type="submit"
              disabled={creatingPromo}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingPromo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {creatingPromo ? t("promos.creating") : t("promos.create")}
            </button>
          </div>
        </form>

        {/* Coupon Code Generator */}
        <form
          onSubmit={handleCreateCoupon}
          className="rounded-xl bg-white p-6 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Ticket className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("promos.coupons.title")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("promos.coupons.subtitle")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>{t("promos.coupons.code")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("checkout.coupon.placeholder")}
                  dir="ltr"
                  className={`${inputClass} font-mono uppercase`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setCode(generateCouponCode(Number(couponDiscount) || 0))
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                  title={t("promos.coupons.generate")}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("promos.coupons.generate")}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {t("promos.coupons.discount")}
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={couponDiscount}
                  onChange={(e) => setCouponDiscount(e.target.value)}
                  placeholder="100"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("promos.coupons.minSpend")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("promos.coupons.maxUses")}</label>
                <input
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("promos.coupons.expires")}</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creatingCoupon}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingCoupon ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creatingCoupon
                ? t("promos.coupons.creating")
                : t("promos.coupons.create")}
            </button>
          </div>

          {/* Coupon list */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-900">
              {t("promos.coupons.title")}
            </h4>
            {coupons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                {t("promos.coupons.empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {coupons.map((coupon) => {
                  const status = couponStatus(coupon, timestamp);
                  return (
                    <li
                      key={coupon.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="truncate font-mono text-sm font-bold text-slate-900"
                            dir="ltr"
                          >
                            {coupon.code}
                          </span>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              COUPON_STATUS_CLASS[status]
                            }`}
                          >
                            {t(COUPON_STATUS_LABEL[status])}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatMoney(coupon.discountAmount)} ·{" "}
                          {t("promos.coupons.usage", {
                            used: coupon.timesUsed,
                            max: coupon.maxUses,
                          })}
                          {coupon.expiresAt &&
                            ` · ${formatDateTime(coupon.expiresAt)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyCode(coupon.code)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t("ai.copy")}
                        title={t("ai.copy")}
                      >
                        {copiedCode === coupon.code ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCoupon(coupon)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </form>
      </div>

      {/* Flash sales list */}
      <div className="mt-6 rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {t("promos.list.title")}
          </h3>
          <Clock3 className="h-5 w-5 text-slate-400" />
        </div>

        {loading ? (
          <div className="p-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="mb-4 h-10 animate-pulse rounded bg-slate-200" />
            ))}
          </div>
        ) : promotions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            {t("promos.list.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {promotions.map((promotion) => {
              const state = promotionState(promotion, timestamp);
              const productsCount =
                promotion.targetProductIds?.length ?? 0;
              const categoriesCount =
                promotion.targetCategoryIds?.length ?? 0;
              const targets =
                productsCount === 0 && categoriesCount === 0
                  ? [t("promos.list.appliesToAll")]
                  : [
                      ...(productsCount > 0
                        ? [
                            t("promos.list.productsCount", {
                              count: productsCount,
                            }),
                          ]
                        : []),
                      ...(categoriesCount > 0
                        ? [
                            t("promos.list.categoriesCount", {
                              count: categoriesCount,
                            }),
                          ]
                        : []),
                    ];

              return (
                <li
                  key={promotion.id}
                  className="flex flex-wrap items-center gap-3 px-6 py-4"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      state === "live" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Percent className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-900">
                        {promotion.title}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          PROMO_STATUS_CLASS[state]
                        }`}
                      >
                        {t(PROMO_STATUS_LABEL[state])}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">
                        -{promotion.discountPercentage}%
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {formatDateTime(promotion.startTime)} →{" "}
                      {formatDateTime(promotion.endTime)} ·{" "}
                      {targets.join(" · ")}
                    </p>
                  </div>

                  {state === "live" && now !== null && (
                    <span
                      className="hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold tabular-nums text-white sm:inline-block"
                      dir="ltr"
                    >
                      {formatCountdown(Date.parse(promotion.endTime) - now)}
                    </span>
                  )}

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={promotion.isActive}
                      onChange={() => togglePromotion(promotion)}
                      className="peer sr-only"
                      aria-label={t("promos.list.toggleLabel")}
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-600 peer-checked:after:translate-x-5" />
                  </label>

                  <button
                    type="button"
                    onClick={() => deletePromotion(promotion)}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

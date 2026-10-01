// Shared, isomorphic helpers for the Promotions & Flash Sales engine.
// This module is intentionally free of React imports so it can be used from
// server components, API routes, and client components alike. React hooks
// live in `@/lib/promotions-hooks`.

export interface PromotionRecord {
  id: string;
  storeId: string;
  title: string;
  discountPercentage: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  bannerText?: string | null;
  showBanner?: boolean | null;
  targetProductIds?: string[] | null;
  targetCategoryIds?: string[] | null;
}

export interface CouponRecord {
  id: string;
  storeId: string;
  code: string;
  discountAmount: string;
  minSpend: string;
  maxUses: number;
  timesUsed: number;
  expiresAt?: string | null;
}

export type CouponStatus = "active" | "expired" | "exhausted";
export type PromotionState = "upcoming" | "live" | "ended" | "paused";

function parse(value: string | number | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function promotionState(
  promotion: PromotionRecord,
  now: number
): PromotionState {
  if (!promotion.isActive) return "paused";
  const start = parse(promotion.startTime);
  const end = parse(promotion.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return "paused";
  if (now < start) return "upcoming";
  if (now >= end) return "ended";
  return "live";
}

export function isPromotionLive(
  promotion: PromotionRecord,
  now: number
): boolean {
  return promotionState(promotion, now) === "live";
}

export function promotionCoversProduct(
  promotion: PromotionRecord,
  product: { id: string; categoryId?: string | null }
): boolean {
  const productIds = promotion.targetProductIds ?? [];
  const categoryIds = promotion.targetCategoryIds ?? [];
  // Empty targeting = whole catalog
  if (productIds.length === 0 && categoryIds.length === 0) return true;
  if (productIds.includes(product.id)) return true;
  if (product.categoryId && categoryIds.includes(product.categoryId)) return true;
  return false;
}

/**
 * Best (highest discount) live promotion that applies to a product.
 * Returns null when nothing is running right now.
 */
export function bestPromotionFor(
  product: { id: string; categoryId?: string | null; price: string },
  promotions: PromotionRecord[],
  now: number
): PromotionRecord | null {
  let best: PromotionRecord | null = null;
  for (const promotion of promotions) {
    if (!isPromotionLive(promotion, now)) continue;
    if (!promotionCoversProduct(promotion, product)) continue;
    if (!best || promotion.discountPercentage > best.discountPercentage) {
      best = promotion;
    }
  }
  return best;
}

export function discountedPrice(
  basePrice: number,
  promotion: PromotionRecord | null
): number {
  if (!promotion || basePrice <= 0) return basePrice;
  const percentage = Math.min(100, Math.max(0, promotion.discountPercentage));
  const price = basePrice * (1 - percentage / 100);
  return Math.max(0, Math.round(price * 100) / 100);
}

/** `02d : 05h : 12m : 45s` — never negative. */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(days)}d : ${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`;
}

export function couponStatus(coupon: CouponRecord, now: number): CouponStatus {
  if (coupon.timesUsed >= coupon.maxUses) return "exhausted";
  if (coupon.expiresAt) {
    const expiry = parse(coupon.expiresAt);
    if (!Number.isNaN(expiry) && now >= expiry) return "expired";
  }
  return "active";
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random shopper-facing code, e.g. `SAVE20-XYZ`. */
export function generateCouponCode(discountAmount = 0): string {
  const rounded = Math.max(0, Math.round(Number(discountAmount) || 0));
  const suffix = Array.from({ length: 3 }, () => {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    return CODE_ALPHABET[index];
  }).join("");
  return `SAVE${rounded}-${suffix}`;
}

/** `datetime-local` input value (local time, minute precision). */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

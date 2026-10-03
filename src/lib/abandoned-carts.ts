import { checkoutPath } from "@/lib/site";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import type { Locale, TranslationKey } from "@/lib/i18n";

/** Discount code promoted inside every WhatsApp recovery message. */
export const RECOVERY_COUPON_CODE = "RECOVER10";

export const ABANDONED_CART_STATUSES = [
  "pending",
  "recovered",
  "expired",
  "dismissed",
] as const;

export type AbandonedCartStatus = (typeof ABANDONED_CART_STATUSES)[number];

export interface AbandonedCartItem {
  productId: string;
  name: string;
  price: string;
  quantity: number;
  imageUrl: string;
}

export interface AbandonedCartRecord {
  id: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  cartItems: AbandonedCartItem[];
  totalAmount: string;
  status: AbandonedCartStatus;
  recoveryToken: string;
  createdAt: string;
}

export interface AbandonedCartsSummary {
  totalAbandonedValue: string;
  recoveredRevenue: string;
  recoveryRate: number;
  activePendingCarts: number;
}

export interface AbandonedCartsResponse {
  carts: AbandonedCartRecord[];
  summary: AbandonedCartsSummary;
  storeSlug?: string;
}

export const ABANDONED_CART_STATUS_LABEL: Record<
  AbandonedCartStatus,
  TranslationKey
> = {
  pending: "recovery.status.pending",
  recovered: "recovery.status.recovered",
  expired: "recovery.status.expired",
  dismissed: "recovery.status.dismissed",
};

export const ABANDONED_CART_STATUS_CLASS: Record<AbandonedCartStatus, string> =
  {
    pending: "bg-amber-100 text-amber-700",
    recovered: "bg-emerald-100 text-emerald-700",
    expired: "bg-slate-100 text-slate-600",
    dismissed: "bg-rose-100 text-rose-600",
  };

export function isAbandonedCartStatus(
  value: unknown
): value is AbandonedCartStatus {
  return (
    typeof value === "string" &&
    (ABANDONED_CART_STATUSES as readonly string[]).includes(value)
  );
}

/** Total number of units across the guest cart snapshot. */
export function cartQuantity(items: AbandonedCartItem[] | null | undefined): number {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

/** Client-side cart total (fallback when the caller does not send one). */
export function cartTotal(items: AbandonedCartItem[] | null | undefined): number {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => {
    const price = parseFloat(item.price);
    const line = (Number.isFinite(price) ? price : 0) * (Number(item.quantity) || 0);
    return sum + line;
  }, 0);
}

/** Metric aggregation shared by the API route and the dashboard page. */
export function computeAbandonedSummary(
  carts: AbandonedCartRecord[]
): AbandonedCartsSummary {
  let abandonedValue = 0;
  let recoveredRevenue = 0;
  let activePendingCarts = 0;
  let recoveredCarts = 0;

  for (const cart of carts) {
    const amount = parseFloat(cart.totalAmount);
    const value = Number.isFinite(amount) ? amount : 0;

    if (cart.status === "pending") {
      abandonedValue += value;
      activePendingCarts += 1;
    } else if (cart.status === "recovered") {
      recoveredRevenue += value;
      recoveredCarts += 1;
    }
  }

  const tracked = activePendingCarts + recoveredCarts;

  return {
    totalAbandonedValue: abandonedValue.toFixed(2),
    recoveredRevenue: recoveredRevenue.toFixed(2),
    recoveryRate:
      tracked > 0
        ? Math.round((recoveredCarts / tracked) * 1000) / 10
        : 0,
    activePendingCarts,
  };
}

/** `/store/{slug}/checkout?recover=…&code=RECOVER10` */
export function buildRecoveryCheckoutPath(
  slug: string,
  recoveryToken: string,
  couponCode: string = RECOVERY_COUPON_CODE
): string {
  const params = new URLSearchParams();
  if (recoveryToken) params.set("recover", recoveryToken);
  if (couponCode) params.set("code", couponCode);
  const query = params.toString();
  return query ? `${checkoutPath(slug)}?${query}` : checkoutPath(slug);
}

/** Absolute deep link used inside the WhatsApp message. */
export function buildRecoveryCheckoutUrl(
  origin: string,
  slug: string,
  recoveryToken: string,
  couponCode: string = RECOVERY_COUPON_CODE
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${buildRecoveryCheckoutPath(slug, recoveryToken, couponCode)}`;
}

export interface WhatsAppRecoveryInput {
  customerName: string;
  itemQuantity: number;
  checkoutUrl: string;
  couponCode?: string;
}

/**
 * Pre-filled Arabic (default) recovery message:
 * "أهلاً [الاسم] 👋، لاحظنا إنك سبت [عدد المنتجات] منتج في السلة في متجرنا.
 *  خصصنا لك كود خصم خاص [RECOVER10] كمل طلبك من الرابط التالي: [رابط]"
 */
export function buildWhatsAppRecoveryText(
  input: WhatsAppRecoveryInput,
  locale: Locale = "ar"
): string {
  const name = input.customerName.trim() || (locale === "ar" ? "عميلنا" : "there");
  const quantity = Math.max(0, Number(input.itemQuantity) || 0);
  const code = input.couponCode || RECOVERY_COUPON_CODE;
  const { checkoutUrl } = input;

  if (locale === "ar") {
    return `أهلاً ${name} 👋، لاحظنا إنك سبت ${quantity} منتج في السلة في متجرنا. خصصنا لك كود خصم خاص ${code} كمل طلبك من الرابط التالي: ${checkoutUrl}`;
  }

  return `Hi ${name} 👋, we noticed you left ${quantity} item(s) in your cart at our store. We have prepared an exclusive discount code ${code} for you. Complete your order from here: ${checkoutUrl}`;
}

/** `https://wa.me/[phone]?text=[encoded_message]` or `null` when undialable. */
export function buildWhatsAppRecoveryUrl(
  phone: string | null | undefined,
  text: string
): string | null {
  const digits = normalizeWhatsAppNumber(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

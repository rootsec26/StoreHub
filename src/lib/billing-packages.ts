/**
 * Pay-per-use credit packages and monthly add-on pricing.
 *
 * Shared by the billing dashboard UI (client) and the billing API routes
 * (server) so a purchase can never be priced differently from what the
 * merchant saw. Keep this module free of server-only imports.
 */

export type CreditType = "ai" | "whatsapp";

export interface AiCreditPackage {
  id: string;
  credits: number;
  /** Price in EGP. */
  price: number;
}

export interface WhatsAppCreditPackage {
  id: string;
  messages: number;
  /** Price in EGP. */
  price: number;
}

// ---------------------------------------------------------------------------
// Dynamic Billing Packages (from DB)
// ---------------------------------------------------------------------------

export interface BillingPackage {
  type: ActivationCodeType;
  nameAr: string | null;
  nameEn: string | null;
  basePrice: number;
  promoPrice: number | null;
  promoExpiresAt: string | null;
  isActive: boolean;
  /** The effective price (promo if active, otherwise base) */
  effectivePrice: number;
  /** Whether a promotional price is currently active */
  hasActivePromo: boolean;
  /** Time remaining for active promo in milliseconds, null if no active promo */
  promoTimeRemaining: number | null;
}

export interface BillingPackagesResponse {
  packages: BillingPackage[];
}

/**
 * Compute effective price and promo status from raw pricing data.
 * This is a pure function that can be used on both client and server.
 */
export function computeBillingPackage(
  type: ActivationCodeType,
  data: {
    nameAr: string | null;
    nameEn: string | null;
    basePrice: number;
    promoPrice: number | null;
    promoExpiresAt: string | null;
    isActive: boolean;
  },
  now: number = Date.now()
): BillingPackage {
  const promoActive =
    data.promoPrice !== null &&
    data.promoExpiresAt !== null &&
    new Date(data.promoExpiresAt).getTime() > now;

  const effectivePrice = promoActive ? data.promoPrice! : data.basePrice;
  const promoTimeRemaining =
    data.promoPrice !== null && data.promoExpiresAt !== null
      ? Math.max(0, new Date(data.promoExpiresAt).getTime() - now)
      : null;

  return {
    type,
    nameAr: data.nameAr,
    nameEn: data.nameEn,
    basePrice: data.basePrice,
    promoPrice: data.promoPrice,
    promoExpiresAt: data.promoExpiresAt,
    isActive: data.isActive,
    effectivePrice,
    hasActivePromo: promoActive,
    promoTimeRemaining,
  };
}

/** Free allowance granted to every store (also used when seeding rows). */
export const FREE_AI_CREDITS = 50;

/** Seats included with every store before any paid add-on. */
export const INCLUDED_STAFF_SEATS = 1;

/** Monthly price (EGP) of the white-label add-on. */
export const WHITE_LABEL_PRICE = 99;

/** Monthly price (EGP) of one extra staff seat. */
export const STAFF_SEAT_PRICE = 50;

/** Upper bound for extra seats so the stepper cannot run away. */
export const MAX_EXTRA_STAFF_SEATS = 20;

export const AI_CREDIT_PACKAGES: readonly AiCreditPackage[] = [
  { id: "ai_500", credits: 500, price: 100 },
  { id: "ai_2000", credits: 2000, price: 300 },
];

export const WHATSAPP_CREDIT_PACKAGES: readonly WhatsAppCreditPackage[] = [
  { id: "whatsapp_500", messages: 500, price: 150 },
  { id: "whatsapp_2000", messages: 2000, price: 500 },
];

export function findAiCreditPackage(
  packageId: string
): AiCreditPackage | undefined {
  return AI_CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
}

export function findWhatsAppCreditPackage(
  packageId: string
): WhatsAppCreditPackage | undefined {
  return WHATSAPP_CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
}

export function clampExtraStaffSeats(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_EXTRA_STAFF_SEATS, Math.max(0, Math.floor(value)));
}

// ---------------------------------------------------------------------------
// Activation codes (payment vouchers)
// ---------------------------------------------------------------------------

/** Days a credit balance stays usable after a voucher is redeemed. */
export const CREDIT_VALIDITY_DAYS = 30;

/** Every voucher product the Super Admin can generate. */
export const ACTIVATION_CODE_TYPES = [
  "PLAN_PRO",
  "PLAN_ENTERPRISE",
  "AI_CREDITS_500",
  "AI_CREDITS_2000",
  "WA_CREDITS_500",
  "WA_CREDITS_2000",
  "REMOVE_BRANDING",
  "STAFF_SEAT",
] as const;

export type ActivationCodeType = (typeof ACTIVATION_CODE_TYPES)[number];

export interface ActivationCodeSpec {
  type: ActivationCodeType;
  kind: "plan" | "credit" | "addon";
  /** `ai` / `whatsapp` for credit vouchers, `null` for plan/addon vouchers. */
  creditType: CreditType | null;
  /** Units granted on redemption for credit vouchers. */
  creditAmount: number | null;
  /** Days of paid-plan entitlement granted by a plan voucher, or add-on validity days. */
  planDays: number;
  /** Store plan activated by a plan voucher. */
  grantsPlan: "free" | "pro";
  /** Fixed prefix baked into every generated code, e.g. `AI500-X82A-99LK`. */
  prefix: string;
  /** Price in EGP the merchant is asked to pay before receiving the code. */
  price: number;
  /** English label — the Super Admin panel is not localized. */
  label: string;
}

export const ACTIVATION_CODE_SPECS: Record<ActivationCodeType, ActivationCodeSpec> = {
  PLAN_PRO: {
    type: "PLAN_PRO",
    kind: "plan",
    creditType: null,
    creditAmount: null,
    planDays: 30,
    grantsPlan: "pro",
    prefix: "PRO",
    price: 299,
    label: "Pro plan · 30 days",
  },
  PLAN_ENTERPRISE: {
    type: "PLAN_ENTERPRISE",
    kind: "plan",
    creditType: null,
    creditAmount: null,
    planDays: 365,
    grantsPlan: "pro",
    prefix: "ENT",
    price: 2999,
    label: "Enterprise plan · 365 days",
  },
  AI_CREDITS_500: {
    type: "AI_CREDITS_500",
    kind: "credit",
    creditType: "ai",
    creditAmount: 500,
    planDays: 30,
    grantsPlan: "free",
    prefix: "AI500",
    price: 100,
    label: "500 AI credits",
  },
  AI_CREDITS_2000: {
    type: "AI_CREDITS_2000",
    kind: "credit",
    creditType: "ai",
    creditAmount: 2000,
    planDays: 30,
    grantsPlan: "free",
    prefix: "AI2K",
    price: 300,
    label: "2000 AI credits",
  },
  WA_CREDITS_500: {
    type: "WA_CREDITS_500",
    kind: "credit",
    creditType: "whatsapp",
    creditAmount: 500,
    planDays: 30,
    grantsPlan: "free",
    prefix: "WA500",
    price: 150,
    label: "500 WhatsApp messages",
  },
  WA_CREDITS_2000: {
    type: "WA_CREDITS_2000",
    kind: "credit",
    creditType: "whatsapp",
    creditAmount: 2000,
    planDays: 30,
    grantsPlan: "free",
    prefix: "WA2K",
    price: 500,
    label: "2000 WhatsApp messages",
  },
  REMOVE_BRANDING: {
    type: "REMOVE_BRANDING",
    kind: "addon",
    creditType: null,
    creditAmount: null,
    planDays: 30,
    grantsPlan: "free",
    prefix: "WLOFF",
    price: 99,
    label: "Remove Branding (30 days)",
  },
  STAFF_SEAT: {
    type: "STAFF_SEAT",
    kind: "addon",
    creditType: null,
    creditAmount: null,
    planDays: 30,
    grantsPlan: "free",
    prefix: "SEAT",
    price: 50,
    label: "Extra Staff Seat (30 days)",
  },
};

export function isActivationCodeType(
  value: unknown
): value is ActivationCodeType {
  return (
    typeof value === "string" &&
    (ACTIVATION_CODE_TYPES as readonly string[]).includes(value)
  );
}

export function activationCodeSpec(
  type: ActivationCodeType
): ActivationCodeSpec {
  return ACTIVATION_CODE_SPECS[type];
}

/** Price (EGP) of the credit package a voucher redeems against, if any. */
export function creditPackagePrice(
  spec: ActivationCodeSpec
): number | null {
  if (spec.kind !== "credit" || !spec.creditType) return null;
  if (spec.creditType === "ai") {
    return (
      AI_CREDIT_PACKAGES.find((pkg) => pkg.credits === spec.creditAmount)
        ?.price ?? null
    );
  }
  return (
    WHATSAPP_CREDIT_PACKAGES.find((pkg) => pkg.messages === spec.creditAmount)
      ?.price ?? null
  );
}

// ---------------------------------------------------------------------------
// Manual payment instructions shown in the payment modal
// ---------------------------------------------------------------------------

export interface BillingPaymentMethod {
  id: string;
  label: string;
  number: string;
}

/** Vodafone Cash / InstaPay numbers merchants transfer to before redeeming. */
export const BILLING_PAYMENT_METHODS: readonly BillingPaymentMethod[] = [
  { id: "vodafone_cash", label: "Vodafone Cash", number: "01065592701" },
  { id: "instapay", label: "InstaPay", number: "01065592701" },
];

/** Digits used for the `wa.me` support link in the payment modal. */
export const BILLING_SUPPORT_WHATSAPP = "201065592701";
export const BILLING_SUPPORT_PHONE = "01065592701";

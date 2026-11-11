import "server-only";

import type { TranslationKey } from "@/lib/i18n";

/**
 * Manual subscription billing config — SINGLE source of truth for plan
 * price/currency/duration. Amounts are NEVER taken from the client.
 */

export type BillingMethod = "instapay" | "vodafone_cash" | "bank_transfer";

export interface BillingPlan {
  key: string;
  productKey: "storehub";
  nameKey: TranslationKey;
  price: string;
  currency: string;
  durationDays: number;
}

/** Enum stays extensible; only vodafone_cash is active in the UI. */
export const BILLING_METHODS: readonly BillingMethod[] = [
  "instapay",
  "vodafone_cash",
  "bank_transfer",
];

export const ACTIVE_PAYMENT_METHODS: readonly BillingMethod[] = [
  "vodafone_cash",
];

export function isBillingMethod(value: unknown): value is BillingMethod {
  return (
    typeof value === "string" &&
    (BILLING_METHODS as readonly string[]).includes(value)
  );
}

/** StoreHub monthly subscription — the only plan for now. */
export const STOREHUB_PLANS: Record<string, BillingPlan> = {
  storehub_monthly: {
    key: "storehub_monthly",
    productKey: "storehub",
    nameKey: "billing.planMonthly",
    price: "299",
    currency: "EGP",
    durationDays: 30,
  },
};

export function getBillingPlan(key: unknown): BillingPlan | null {
  return typeof key === "string" ? (STOREHUB_PLANS[key] ?? null) : null;
}

export interface PaymentInstructions {
  method: BillingMethod;
  account: string;
  accountName: string;
  notes: string;
}

/** Vodafone Cash wallet details — server-side env only, never hardcoded. */
export function getPaymentInstructions(): PaymentInstructions[] {
  return ACTIVE_PAYMENT_METHODS.map((method) => ({
    method,
    account:
      method === "vodafone_cash"
        ? (process.env.PAYMENT_VODAFONE_CASH_NUMBER ?? "")
        : "",
    accountName:
      method === "vodafone_cash"
        ? (process.env.PAYMENT_VODAFONE_CASH_NAME ?? "")
        : "",
    notes:
      method === "vodafone_cash"
        ? (process.env.PAYMENT_VODAFONE_CASH_NOTES ?? "")
        : "",
  }));
}

/** Egyptian mobile sender phone: ^01[0125][0-9]{8}$ (normalized to 01xxxxxxxxx). */
export function normalizeEgyptianPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s\-()]/g, "");
  const local = digits.replace(/^(\+20|0020)/, "0");
  return /^01[0125][0-9]{8}$/.test(local) ? local : null;
}

/** Normalize a Vodafone Cash operation number for uniqueness checks. */
export function normalizeTransactionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return normalized.length >= 4 && normalized.length <= 64 ? normalized : null;
}

/** ~1.5 MB after client-side compression. */
export const MAX_PROOF_DATA_URL_LENGTH = 2_000_000;
/** Hard cap on the decoded binary payload (~1.4 MB). */
export const MAX_PROOF_BYTES = 1_500_000;

const PROOF_DATA_URL_PATTERN =
  /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i;

type ProofMime = "jpeg" | "png" | "webp";

/** Magic-byte signatures — the declared MIME must match the real content. */
function sniffImageMime(bytes: Buffer): ProofMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Validates a compressed proof data URL: declared type must be
 * jpeg/png/webp (SVG and every other type rejected), size capped, and the
 * decoded bytes must carry the matching magic-byte signature — a data URL
 * cannot lie about being a PNG while actually carrying markup.
 */
export function isAllowedProofDataUrl(value: string): boolean {
  if (value.length > MAX_PROOF_DATA_URL_LENGTH) return false;
  const match = PROOF_DATA_URL_PATTERN.exec(value);
  if (!match) return false;
  const declared = match[1].toLowerCase() as ProofMime;
  try {
    const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    if (bytes.length === 0 || bytes.length > MAX_PROOF_BYTES) return false;
    return sniffImageMime(bytes) === declared;
  } catch {
    return false;
  }
}

/** Pending requests allowed per user — anti-spam. */
export const MAX_PENDING_REQUESTS = 3;

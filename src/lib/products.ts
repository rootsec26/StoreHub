import { GraduationCap, Store, type LucideIcon } from "lucide-react";

import type { TranslationKey } from "@/lib/i18n";

/**
 * Aura Hub — unified multi-product access model.
 *
 * `ProductKey` is the extensible union of products in the Aura ecosystem.
 * Add a new member here plus a `PRODUCT_REGISTRY` entry to ship a new
 * product slot — access state, routing and UI pick it up automatically.
 */
export type ProductKey = "storehub" | "academy";

export const PRODUCT_KEYS: readonly ProductKey[] = ["storehub", "academy"];

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && (PRODUCT_KEYS as readonly string[]).includes(value);
}

export type ProductAccessStatus = "none" | "trial" | "active" | "expired";

export interface ProductAccess {
  status: ProductAccessStatus;
  /** True once the product's own onboarding/setup flow has completed. */
  onboardingCompleted: boolean;
  /** ISO timestamp when the current paid/trial period ends (null = open). */
  currentPeriodEnd?: string | null;
  /** "Notify me" interest flag for coming-soon products. */
  waitlisted?: boolean;
}

/** Per-user access map persisted on `users.products` (jsonb). */
export type UserProductMap = Partial<Record<ProductKey, ProductAccess>>;

export type ProductStatus = "available" | "coming_soon";

export interface ProductDefinition {
  key: ProductKey;
  nameKey: TranslationKey;
  taglineKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
  status: ProductStatus;
  /** Route the user lands on once access is granted and onboarding done. */
  entryRoute: string | null;
  /** Route used when access is granted but onboarding is still incomplete. */
  onboardingRoute: string | null;
}

/** Single source of truth for every Aura product. */
export const PRODUCT_REGISTRY: Record<ProductKey, ProductDefinition> = {
  storehub: {
    key: "storehub",
    nameKey: "landing.product.storehub.name",
    taglineKey: "landing.product.storehub.tagline",
    descriptionKey: "landing.product.storehub.description",
    icon: Store,
    status: "available",
    entryRoute: "/dashboard",
    onboardingRoute: "/onboarding",
  },
  academy: {
    key: "academy",
    nameKey: "landing.product.academy.name",
    taglineKey: "landing.product.academy.tagline",
    descriptionKey: "landing.product.academy.description",
    icon: GraduationCap,
    status: "coming_soon",
    entryRoute: null,
    onboardingRoute: null,
  },
};

export function getProductDefinition(key: ProductKey): ProductDefinition {
  return PRODUCT_REGISTRY[key];
}

/** True when the user may enter the product (trial counts as access). */
export function hasProductAccess(
  products: UserProductMap,
  key: ProductKey
): boolean {
  const access = products[key];
  return Boolean(
    access && (access.status === "active" || access.status === "trial")
  );
}

/** Keys of every product the user can currently enter. */
export function getActiveProductKeys(products: UserProductMap): ProductKey[] {
  return PRODUCT_KEYS.filter((key) => hasProductAccess(products, key));
}

/**
 * Where a user should land when entering `key`, or `null` when the product
 * has no navigable route (coming soon). Products with incomplete onboarding
 * resolve to their `onboardingRoute`.
 */
export function getProductEntryRoute(
  products: UserProductMap,
  key: ProductKey
): string | null {
  const def = PRODUCT_REGISTRY[key];
  if (def.status === "coming_soon") return null;
  const access = products[key];
  if (access && !access.onboardingCompleted && def.onboardingRoute) {
    return def.onboardingRoute;
  }
  return def.entryRoute;
}

/**
 * Validate an internal return URL (`?next=`). Rejects absolute URLs,
 * protocol-relative URLs and app-internal paths that would loop back into
 * auth or the product hub itself.
 */
export function getSafeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  // Browsers normalise `\` to `/` in special schemes — `/\evil.com` would
  // otherwise resolve as a protocol-relative URL (open redirect).
  if (trimmed.includes("\\")) return null;
  if (trimmed.length > 500) return null;
  if (trimmed === "/" || trimmed === "/select-product") return null;
  if (
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/sign-in") ||
    trimmed.startsWith("/signup") ||
    trimmed.startsWith("/auth/") ||
    trimmed.startsWith("/api/")
  ) {
    return null;
  }
  return trimmed;
}

// ============================================
// Subscription entitlement (lazy expiry, no cron)
// ============================================

/** Grace period after a PAID period ends before access is cut. */
export const STOREHUB_GRACE_DAYS = Math.max(
  0,
  Number(process.env.NEXT_PUBLIC_STOREHUB_GRACE_DAYS ?? "3") || 3
);

/**
 * Optional free-trial length. Default 0 = NO trials: every store needs an
 * approved payment. Set BILLING_TRIAL_DAYS>0 to re-enable the legacy
 * first-seen trial window.
 */
export const STOREHUB_TRIAL_DAYS = Math.max(
  0,
  Number(process.env.BILLING_TRIAL_DAYS ?? "0") || 0
);

export interface StorehubEntitlementInput {
  /** Persisted access entry from users.products (may be undefined). */
  stored?: ProductAccess;
  /** Whether the user currently has store access (owner or member). */
  hasStore: boolean;
  /** stores.created_at — anchors the grandfathered trial window. */
  storeCreatedAt?: string | Date | null;
  now?: number;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Computes the EFFECTIVE StoreHub access for a user. Pure — safe to call
 * from server components, route handlers and middleware.
 *
 * Rules (no free trials by default):
 * - No store            -> stored entry as-is ONLY while onboarding is
 *                        incomplete (pre-store product selection); every
 *                        other stored entry grants nothing without a store.
 * - Store + paid period -> 'active' while an APPROVED payment's
 *                        currentPeriodEnd (+ grace for lapsed paid subs) holds.
 *                        Only status 'active' counts — it is written
 *                        exclusively by admin payment approval, so persisted
 *                        'trial' rows and stray currentPeriodEnd values can
 *                        never grant access.
 * - Never paid / trial  -> 'none' (locked immediately, no grace).
 * - Lapsed paid + grace -> 'active'; past grace -> 'expired'.
 * - BILLING_TRIAL_DAYS>0 re-enables the legacy one-time trial window.
 */
export function evaluateStorehubEntitlement(
  input: StorehubEntitlementInput
): ProductAccess {
  const now = input.now ?? Date.now();
  const graceMs = STOREHUB_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const stored = input.stored;

  const periodEndMs = toMs(stored?.currentPeriodEnd);

  if (!input.hasStore) {
    // Paid access is per-USER and survives without a store: an approved
    // period routes the user to /onboarding (pay-first flow). Lapsed paid
    // periods get the same grace window as store owners.
    if (stored?.status === "active" && periodEndMs !== null) {
      if (now < periodEndMs + graceMs) {
        return {
          status: "active",
          onboardingCompleted: true,
          currentPeriodEnd: stored.currentPeriodEnd ?? null,
        };
      }
      return {
        status: "expired",
        onboardingCompleted: true,
        currentPeriodEnd: stored.currentPeriodEnd ?? null,
      };
    }
    if (stored?.status === "expired") {
      return { status: "expired", onboardingCompleted: true };
    }
    // Mid-selection entries (activateProduct writes trial +
    // onboardingCompleted:false) are kept so routing helpers can tell
    // "chose the product but never paid" apart from "never chose".
    if (
      stored &&
      stored.onboardingCompleted === false &&
      stored.status !== "none"
    ) {
      return { ...stored };
    }
    return { status: "none", onboardingCompleted: false };
  }

  // Paid access requires an admin-approved period. 'active' is only ever
  // written by payment approval; 'trial' and legacy period ends are ignored.
  if (stored?.status === "active" && periodEndMs !== null) {
    if (now < periodEndMs + graceMs) {
      return {
        status: "active",
        onboardingCompleted: true,
        currentPeriodEnd: stored.currentPeriodEnd ?? null,
        ...(stored.waitlisted ? { waitlisted: true } : {}),
      };
    }
    return {
      status: "expired",
      onboardingCompleted: true,
      currentPeriodEnd: stored.currentPeriodEnd ?? null,
    };
  }

  if (stored?.status === "expired") {
    return {
      status: "expired",
      onboardingCompleted: true,
      ...(stored.currentPeriodEnd
        ? { currentPeriodEnd: stored.currentPeriodEnd }
        : {}),
    };
  }

  // Optional re-enableable trial (BILLING_TRIAL_DAYS>0): one-time window
  // measured from first evaluation, persisted once by products-server.
  if (STOREHUB_TRIAL_DAYS > 0) {
    const trialEnd = new Date(
      now + STOREHUB_TRIAL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const expired = now >= new Date(trialEnd).getTime() + graceMs;
    return {
      status: expired ? "expired" : "trial",
      onboardingCompleted: true,
      currentPeriodEnd: trialEnd,
    };
  }

  // Never paid (or only trial data): locked immediately — no grace period.
  return { status: "none", onboardingCompleted: true };
}

/** True when evaluated StoreHub access still allows entering the product. */
export function storehubAccessAllows(entry: ProductAccess | undefined): boolean {
  return Boolean(
    entry && (entry.status === "active" || entry.status === "trial")
  );
}

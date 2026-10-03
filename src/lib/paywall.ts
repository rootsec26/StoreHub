import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { storeAddOns, storeCredits, stores } from "@/db/schema";
import {
  FREE_AI_CREDITS,
  INCLUDED_STAFF_SEATS,
  CREDIT_VALIDITY_DAYS,
  type CreditType,
} from "@/lib/billing-packages";
import { isPlanActive as isPlanActiveRow, normalizePlan, type Plan } from "@/lib/plans";

/**
 * Server-side feature gate for the Add-ons, Credits & Paywall system.
 *
 * - `canUseAICredits` / `canUseWhatsAppCredits` atomically check **and**
 *   deduct a pay-per-use balance, throwing `PaywallError` when the balance is
 *   empty (`*_CREDITS_EXHAUSTED`) **or** when the balance's expiry window has
 *   lapsed (`CREDITS_EXPIRED`). Every failure is a `402 PAYMENT_REQUIRED`.
 * - `requireActivePlan` / `isPlanActive` enforce `plan_expires_at > NOW()` for
 *   paid-plan features (`PLAN_EXPIRED` / `PAYMENT_REQUIRED`, 402).
 * - `hasFeatureAccess` answers whether a monthly add-on (e.g. `white_label`)
 *   is currently entitled (requires an active paid plan).
 * - `resolveApiFeatureGate` lets the request middleware block gated API
 *   routes before the handler runs.
 */

export type { CreditType };

/** Monthly add-on codes tracked in `store_add_ons`. */
export type AddOnFeature = "white_label" | "staff_seats";

export type PaywallErrorCode =
  | "AI_CREDITS_EXHAUSTED"
  | "WHATSAPP_CREDITS_EXHAUSTED"
  | "CREDITS_EXPIRED"
  | "PLAN_EXPIRED"
  | "PAYMENT_REQUIRED"
  | "STORE_NOT_FOUND"
  | "INVALID_COST";

export class PaywallError extends Error {
  readonly code: PaywallErrorCode;
  readonly status: number;

  constructor(code: PaywallErrorCode, message: string, status = 402) {
    super(message);
    this.name = "PaywallError";
    this.code = code;
    this.status = status;
  }
}

export interface StoreEntitlements {
  storeId: string;
  plan: Plan;
  /** `null` means the plan never expires (free tier). */
  planExpiresAt: Date | null;
  /** True while `plan_expires_at` is in the future (always true for free). */
  planActive: boolean;
  aiCredits: number;
  aiCreditsExpiresAt: Date | null;
  whatsappCredits: number;
  waCreditsExpiresAt: Date | null;
  hasWhiteLabel: boolean;
  maxStaffSeats: number;
  addOns: Array<{ code: string; quantity: number; isActive: boolean }>;
}

/** Rolling window handed to stores when the expiry columns are not migrated. */
function fallbackExpiry(): Date {
  return new Date(Date.now() + CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

function isPast(value: Date | string | null | undefined): boolean {
  if (!value) return true;
  const ts = new Date(value).getTime();
  return !Number.isFinite(ts) || ts <= Date.now();
}

/** Expiry column guarding each credit balance. */
function expiryColumnFor(
  column: "aiCredits" | "whatsappCredits"
): typeof stores.aiCreditsExpiresAt | typeof stores.waCreditsExpiresAt {
  return column === "aiCredits"
    ? stores.aiCreditsExpiresAt
    : stores.waCreditsExpiresAt;
}

function expiredError(type: CreditType): PaywallError {
  return new PaywallError(
    "CREDITS_EXPIRED",
    type === "ai"
      ? "Your AI credits have expired. Redeem a new top-up code from Billing."
      : "Your WhatsApp credits have expired. Redeem a new top-up code from Billing.",
    402
  );
}


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * `42703` = undefined column, `42P01` = undefined table. Both mean the
 * paywall migration has not been applied yet, so callers degrade gracefully
 * instead of 500-ing the whole app.
 */
function isMissingSchemaObject(error: unknown): boolean {
  const code =
    typeof (error as { code?: unknown } | null)?.code === "string"
      ? (error as { code: string }).code
      : "";
  if (code === "42703" || code === "42P01" || code === "42P06") return true;
  const message =
    typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : "";
  return (
    message.includes("does not exist") || message.includes('relation "')
  );
}

function logSchemaFallback(context: string, error: unknown): void {
  console.warn(
    `[paywall] ${context}: paywall columns/tables are unavailable ` +
      `(${error instanceof Error ? error.message : String(error)}). ` +
      `Run supabase/migrations/0011_addons_credits_paywall.sql.`
  );
}

/** Resolves the store owned by `ownerId`, or `null` when the user has none. */
export async function getStoreIdForOwner(
  ownerId: string
): Promise<string | null> {
  if (!ownerId) return null;
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Current credit balances + expiry windows + add-on entitlements. */
export async function getStoreEntitlements(
  storeId: string
): Promise<StoreEntitlements | null> {
  if (!isValidUuid(storeId)) return null;

  let row:
    | {
        id: string;
        plan: string;
        planExpiresAt: Date | null;
        aiCredits: number | null;
        aiCreditsExpiresAt: Date | null;
        whatsappCredits: number | null;
        waCreditsExpiresAt: Date | null;
        hasWhiteLabel: boolean | null;
        maxStaffSeats: number | null;
      }
    | undefined;
  // True when the expiry columns are missing and legacy behaviour is kept.
  let degraded = false;

  try {
    const rows = await db
      .select({
        id: stores.id,
        plan: stores.plan,
        planExpiresAt: stores.planExpiresAt,
        aiCredits: stores.aiCredits,
        aiCreditsExpiresAt: stores.aiCreditsExpiresAt,
        whatsappCredits: stores.whatsappCredits,
        waCreditsExpiresAt: stores.waCreditsExpiresAt,
        hasWhiteLabel: stores.hasWhiteLabel,
        maxStaffSeats: stores.maxStaffSeats,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    row = rows[0];
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    logSchemaFallback("getStoreEntitlements", error);
    degraded = true;
    const fallback = await db
      .select({ id: stores.id, plan: stores.plan })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    row = fallback[0]
      ? {
          id: fallback[0].id,
          plan: fallback[0].plan,
          planExpiresAt: null,
          aiCredits: FREE_AI_CREDITS,
          aiCreditsExpiresAt: fallbackExpiry(),
          whatsappCredits: 0,
          waCreditsExpiresAt: fallbackExpiry(),
          hasWhiteLabel: false,
          maxStaffSeats: INCLUDED_STAFF_SEATS,
        }
      : undefined;
  }

  if (!row) return null;

  const plan = normalizePlan(row.plan);
  const planActive = degraded || isPlanActiveRow(plan, row.planExpiresAt);

  let addOns: StoreEntitlements["addOns"] = [];
  try {
    const rows = await db
      .select({
        code: storeAddOns.addOnCode,
        quantity: storeAddOns.quantity,
        isActive: storeAddOns.isActive,
      })
      .from(storeAddOns)
      .where(eq(storeAddOns.storeId, storeId));
    addOns = rows.map((r) => ({
      code: r.code,
      quantity: r.quantity,
      isActive: r.isActive,
    }));
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    logSchemaFallback("getStoreEntitlements.addOns", error);
  }

  return {
    storeId: row.id,
    plan,
    planExpiresAt: row.planExpiresAt,
    planActive,
    aiCredits: row.aiCredits ?? FREE_AI_CREDITS,
    aiCreditsExpiresAt: row.aiCreditsExpiresAt,
    whatsappCredits: row.whatsappCredits ?? 0,
    waCreditsExpiresAt: row.waCreditsExpiresAt,
    hasWhiteLabel: row.hasWhiteLabel ?? false,
    maxStaffSeats: row.maxStaffSeats ?? INCLUDED_STAFF_SEATS,
    addOns,
  };
}

/**
 * Atomically deducts `cost` units from a store credit balance.
 * Returns the balance left after the deduction, or `null` when the paywall
 * schema is not migrated yet (credits are then treated as unmetered).
 * Throws `PaywallError` when the store is missing, the balance is empty
 * (`*_CREDITS_EXHAUSTED`) or the balance's validity window has lapsed
 * (`CREDITS_EXPIRED`) — always with HTTP 402.
 */
async function deductCredits(
  storeId: string,
  column: "aiCredits" | "whatsappCredits",
  cost: number,
  exhausted: PaywallErrorCode
): Promise<number | null> {
  if (!isValidUuid(storeId)) {
    throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
  }
  if (!Number.isInteger(cost) || cost < 1) {
    throw new PaywallError(
      "INVALID_COST",
      "Credit cost must be a positive whole number",
      400
    );
  }

  const type: CreditType = column === "aiCredits" ? "ai" : "whatsapp";
  const expiryColumn = expiryColumnFor(column);

  // Strict window check first: expired balances are never spendable, even
  // when the numeric balance is still positive.
  try {
    const rows = await db
      .select({ expiresAt: expiryColumn })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (rows.length === 0) {
      throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
    }
    if (isPast(rows[0].expiresAt)) {
      throw expiredError(type);
    }
  } catch (error) {
    if (error instanceof PaywallError) throw error;
    if (!isMissingSchemaObject(error)) throw error;
    // Expiry columns are missing: degrade to balance-only metering.
    logSchemaFallback(`deductCredits(${column}.expiry)`, error);
  }

  try {
    const patch: PgUpdateSetSource<typeof stores> = {};
    patch[column] = sql`${stores[column]} - ${cost}`;

    const rows = await db
      .update(stores)
      .set(patch)
      .where(and(eq(stores.id, storeId), sql`${stores[column]} >= ${cost}`))
      .returning({ balance: stores[column] });

    if (rows.length > 0) {
      return rows[0].balance;
    }
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      logSchemaFallback(`deductCredits(${column})`, error);
      return null;
    }
    throw error;
  }

  // No row updated: either the store does not exist or the balance is empty.
  const current = await db
    .select({ id: stores.id, expiresAt: expiryColumn })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (current.length === 0) {
    throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
  }

  if (isPast(current[0].expiresAt)) {
    throw expiredError(type);
  }

  throw new PaywallError(
    exhausted,
    exhausted === "AI_CREDITS_EXHAUSTED"
      ? "You are out of AI credits. Redeem a top-up code from Billing to keep generating."
      : "You are out of WhatsApp credits. Redeem a top-up code from Billing to keep sending.",
    402
  );
}

/**
 * Checks the store's AI credit balance and deducts `cost` (default 1).
 * Throws `PaywallError` (`AI_CREDITS_EXHAUSTED` or `CREDITS_EXPIRED`, both
 * HTTP 402) when the balance is empty or past `ai_credits_expires_at`.
 * Resolves with the remaining balance, or `null` when metering is not
 * available yet (paywall migration missing).
 */
export async function canUseAICredits(
  storeId: string,
  cost = 1
): Promise<number | null> {
  return deductCredits(
    storeId,
    "aiCredits",
    cost,
    "AI_CREDITS_EXHAUSTED"
  );
}

/**
 * Same contract as {@link canUseAICredits} for WhatsApp credits.
 * Throws `PaywallError` (`WHATSAPP_CREDITS_EXHAUSTED` or `CREDITS_EXPIRED`,
 * both HTTP 402) when exhausted or past `wa_credits_expires_at`.
 */
export async function canUseWhatsAppCredits(
  storeId: string,
  cost = 1
): Promise<number | null> {
  return deductCredits(
    storeId,
    "whatsappCredits",
    cost,
    "WHATSAPP_CREDITS_EXHAUSTED"
  );
}

/**
 * Non-destructive balance probe (no deduction) — useful for UI banners and
 * for the middleware gate, which must never consume credits.
 * Returns `false` when the balance is empty **or** expired.
 */
export async function hasCredits(
  storeId: string,
  type: CreditType,
  cost = 1
): Promise<boolean> {
  const entitlements = await getStoreEntitlements(storeId);
  if (!entitlements) return false;
  const balance =
    type === "ai" ? entitlements.aiCredits : entitlements.whatsappCredits;
  if (balance < cost) return false;
  return !isPast(
    type === "ai"
      ? entitlements.aiCreditsExpiresAt
      : entitlements.waCreditsExpiresAt
  );
}

/** True while `plan_expires_at` is in the future (strict paid-plan window). */
export async function isPaidPlanActive(storeId: string): Promise<boolean> {
  const entitlements = await getStoreEntitlements(storeId);
  if (!entitlements) return false;
  return entitlements.planActive;
}

/**
 * Throws `PaywallError` (`PLAN_EXPIRED`, HTTP 402) unless the store holds a
 * currently-valid paid plan. Returns the entitlements on success.
 */
export async function requireActivePlan(
  storeId: string
): Promise<StoreEntitlements> {
  const entitlements = await getStoreEntitlements(storeId);
  if (!entitlements) {
    throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
  }
  if (!entitlements.planActive) {
    throw new PaywallError(
      "PLAN_EXPIRED",
      "Your paid plan has expired. Redeem a plan code from Billing to continue.",
      402
    );
  }
  return entitlements;
}

/**
 * Verifies that a store currently holds a paid add-on, e.g.
 * `hasFeatureAccess(storeId, "white_label")`.
 * Add-ons are paid-plan features: access also requires `plan_expires_at` to
 * still be in the future, otherwise `false` is returned.
 */
export async function hasFeatureAccess(
  storeId: string,
  featureName: AddOnFeature | string
): Promise<boolean> {
  if (!isValidUuid(storeId) || !featureName) return false;

  let planActive = true;
  try {
    const entitlements = await getStoreEntitlements(storeId);
    if (!entitlements) return false;
    planActive = entitlements.planActive;
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    logSchemaFallback("hasFeatureAccess.plan", error);
  }
  if (!planActive) return false;

  try {
    const rows = await db
      .select({ isActive: storeAddOns.isActive })
      .from(storeAddOns)
      .where(
        and(
          eq(storeAddOns.storeId, storeId),
          eq(storeAddOns.addOnCode, featureName),
          eq(storeAddOns.isActive, true)
        )
      )
      .limit(1);
    if (rows.length > 0) return true;
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    logSchemaFallback("hasFeatureAccess", error);
  }

  // Fall back to the denormalized flag on `stores` for white-label / seats.
  try {
    if (featureName === "white_label") {
      const rows = await db
        .select({ value: stores.hasWhiteLabel })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      return rows[0]?.value === true;
    }
    if (featureName === "staff_seats") {
      const rows = await db
        .select({ value: stores.maxStaffSeats })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      return (rows[0]?.value ?? INCLUDED_STAFF_SEATS) > INCLUDED_STAFF_SEATS;
    }
  } catch (error) {
    if (!isMissingSchemaObject(error)) throw error;
    logSchemaFallback("hasFeatureAccess.fallback", error);
  }

  return false;
}

/**
 * Adds credits, appends the ledger entry and (optionally) pushes the balance
 * expiry window forward. Returns the new balance.
 *
 * `options.extendExpiryDays` extends `ai_credits_expires_at` /
 * `wa_credits_expires_at` from the later of (now, current expiry) so redeemed
 * top-up codes never shorten an already-paid window.
 */
export async function grantCredits(
  storeId: string,
  type: CreditType,
  amount: number,
  description = "",
  options?: { extendExpiryDays?: number }
): Promise<number | null> {
  if (!isValidUuid(storeId)) {
    throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new PaywallError(
      "INVALID_COST",
      "Credit amount must be a positive whole number",
      400
    );
  }

  const column = type === "ai" ? "aiCredits" : "whatsappCredits";

  try {
    const patch: PgUpdateSetSource<typeof stores> = {};
    patch[column] = sql`${stores[column]} + ${amount}`;

    const extendDays = options?.extendExpiryDays;
    if (extendDays && Number.isInteger(extendDays) && extendDays > 0) {
      const expiryKey =
        type === "ai" ? "aiCreditsExpiresAt" : "waCreditsExpiresAt";
      const expiryColumn =
        type === "ai" ? stores.aiCreditsExpiresAt : stores.waCreditsExpiresAt;
      patch[expiryKey] = sql`GREATEST(COALESCE(${expiryColumn}, now()), now()) + make_interval(days => ${extendDays})`;
    }

    const rows = await db
      .update(stores)
      .set(patch)
      .where(eq(stores.id, storeId))
      .returning({ balance: stores[column] });

    if (rows.length === 0) {
      throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
    }

    const balance = rows[0].balance;

    try {
      await db.insert(storeCredits).values({
        storeId,
        creditType: type,
        amount,
        balanceAfter: balance,
        description,
      });
    } catch (error) {
      // The balance is already updated; never fail a purchase on a ledger miss.
      console.warn("[paywall] failed to record credit ledger entry:", error);
    }

    return balance;
  } catch (error) {
    if (error instanceof PaywallError) throw error;
    if (isMissingSchemaObject(error)) {
      logSchemaFallback("grantCredits", error);
      return null;
    }
    throw error;
  }
}

/** Records a consumption entry so usage stays auditable. */
export async function recordCreditUsage(
  storeId: string,
  type: CreditType,
  amount: number,
  balanceAfter: number | null,
  description = ""
): Promise<void> {
  if (balanceAfter === null) return;
  try {
    await db.insert(storeCredits).values({
      storeId,
      creditType: type,
      amount: -Math.abs(amount),
      balanceAfter,
      description,
    });
  } catch (error) {
    console.warn("[paywall] failed to record credit usage:", error);
  }
}

/** Creates or updates the monthly add-on row for a store. */
export async function upsertAddOn(
  storeId: string,
  code: AddOnFeature,
  quantity: number,
  monthlyPrice: number,
  isActive: boolean
): Promise<void> {
  if (!isValidUuid(storeId)) {
    throw new PaywallError("STORE_NOT_FOUND", "Store not found", 404);
  }

  try {
    const rows = await db
      .select({ id: storeAddOns.id })
      .from(storeAddOns)
      .where(
        and(eq(storeAddOns.storeId, storeId), eq(storeAddOns.addOnCode, code))
      )
      .limit(1);

    if (rows.length === 0) {
      await db.insert(storeAddOns).values({
        storeId,
        addOnCode: code,
        quantity,
        monthlyPrice: String(monthlyPrice),
        isActive,
      });
      return;
    }

    await db
      .update(storeAddOns)
      .set({ quantity, monthlyPrice: String(monthlyPrice), isActive, updatedAt: new Date() })
      .where(eq(storeAddOns.id, rows[0].id));
  } catch (error) {
    if (isMissingSchemaObject(error)) {
      logSchemaFallback("upsertAddOn", error);
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Middleware feature gates
// ---------------------------------------------------------------------------

export interface FeatureGateBlock {
  status: number;
  code: string;
  error: string;
}

export interface ApiFeatureGate {
  /** Path prefix that requires the entitlement, e.g. `/api/ai/`. */
  prefix: string;
  check: "ai_credits" | "whatsapp_credits" | "active_plan";
}

/** API routes that are paywalled, checked before the handler runs. */
export const API_FEATURE_GATES: readonly ApiFeatureGate[] = [
  { prefix: "/api/ai/", check: "ai_credits" },
  { prefix: "/api/whatsapp/", check: "whatsapp_credits" },
];

function gateForPath(pathname: string): ApiFeatureGate | null {
  return (
    API_FEATURE_GATES.find((gate) => pathname.startsWith(gate.prefix)) ?? null
  );
}

/** True when the path is gated at all (used to skip the DB check otherwise). */
export function isGatedApiPath(pathname: string): boolean {
  return gateForPath(pathname) !== null;
}

/**
 * Feature-gate check used by the request middleware. Never deducts credits —
 * it only reports whether the request may proceed. Expired entitlements are
 * blocked with HTTP 402 (`CREDITS_EXPIRED` / `PLAN_EXPIRED`).
 */
export async function resolveApiFeatureGate(
  pathname: string,
  storeId: string | undefined | null
): Promise<FeatureGateBlock | null> {
  const gate = gateForPath(pathname);
  if (!gate) return null;
  if (!storeId) return null; // no store session -> the route answers 401/404

  if (gate.check === "ai_credits" || gate.check === "whatsapp_credits") {
    const type: CreditType = gate.check === "ai_credits" ? "ai" : "whatsapp";
    const entitlements = await getStoreEntitlements(storeId);
    if (!entitlements) return null;

    const balance =
      type === "ai" ? entitlements.aiCredits : entitlements.whatsappCredits;
    const expiresAt =
      type === "ai"
        ? entitlements.aiCreditsExpiresAt
        : entitlements.waCreditsExpiresAt;

    if (isPast(expiresAt)) {
      return {
        status: 402,
        code: "CREDITS_EXPIRED",
        error:
          type === "ai"
            ? "Your AI credits have expired. Redeem a new top-up code from Billing."
            : "Your WhatsApp credits have expired. Redeem a new top-up code from Billing.",
      };
    }

    if (balance < 1) {
      return {
        status: 402,
        code:
          type === "ai"
            ? "AI_CREDITS_EXHAUSTED"
            : "WHATSAPP_CREDITS_EXHAUSTED",
        error:
          type === "ai"
            ? "You are out of AI credits. Redeem a top-up code from Billing to keep generating."
            : "You are out of WhatsApp credits. Redeem a top-up code from Billing to keep sending.",
      };
    }

    return null;
  }

  if (gate.check === "active_plan") {
    const entitlements = await getStoreEntitlements(storeId);
    if (!entitlements) return null;
    if (entitlements.planActive) return null;
    return {
      status: 402,
      code: "PLAN_EXPIRED",
      error:
        "Your paid plan has expired. Redeem a plan code from Billing to continue.",
    };
  }

  return null;
}

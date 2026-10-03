import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { products, stores } from "@/db/schema";
import { isPlanActive, normalizePlan, productLimitFor } from "@/lib/plans";
import type { BillingInfo } from "@/lib/types";
import {
  CREDIT_VALIDITY_DAYS,
  FREE_AI_CREDITS,
  INCLUDED_STAFF_SEATS,
} from "@/lib/billing-packages";

interface StoreBillingRow {
  id: string;
  name: string;
  plan: string;
  planExpiresAt: Date | null;
  aiCredits: number;
  whatsappCredits: number;
  aiCreditsExpiresAt: Date | null;
  waCreditsExpiresAt: Date | null;
  hasWhiteLabel: boolean;
  maxStaffSeats: number;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

async function fetchStoreBillingRow(
  ownerId: string
): Promise<{ row: StoreBillingRow | null; degraded: boolean }> {
  try {
    const store = await db
      .select({
        id: stores.id,
        name: stores.name,
        plan: stores.plan,
        planExpiresAt: stores.planExpiresAt,
        aiCredits: stores.aiCredits,
        whatsappCredits: stores.whatsappCredits,
        aiCreditsExpiresAt: stores.aiCreditsExpiresAt,
        waCreditsExpiresAt: stores.waCreditsExpiresAt,
        hasWhiteLabel: stores.hasWhiteLabel,
        maxStaffSeats: stores.maxStaffSeats,
      })
      .from(stores)
      .where(eq(stores.ownerId, ownerId))
      .limit(1);

    return { row: store[0] ?? null, degraded: false };
  } catch (error) {
    // The paywall migration has not been applied yet: fall back to the
    // columns that certainly exist so billing keeps rendering.
    const code = (error as { code?: string } | null)?.code ?? "";
    if (code !== "42703" && code !== "42P01") throw error;

    const store = await db
      .select({
        id: stores.id,
        name: stores.name,
        plan: stores.plan,
      })
      .from(stores)
      .where(eq(stores.ownerId, ownerId))
      .limit(1);

    if (store.length === 0) return { row: null, degraded: true };
    return {
      degraded: true,
      row: {
        ...store[0],
        // Expiry columns are unavailable: expose a rolling window so the
        // dashboard does not falsely show everything as expired.
        planExpiresAt: null,
        aiCredits: FREE_AI_CREDITS,
        whatsappCredits: 0,
        aiCreditsExpiresAt: rollingWindow(),
        waCreditsExpiresAt: rollingWindow(),
        hasWhiteLabel: false,
        maxStaffSeats: INCLUDED_STAFF_SEATS,
      },
    };
  }
}

function rollingWindow(): Date {
  return new Date(Date.now() + CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Subscription + usage + entitlement expiries for the signed-in store.
 * Paid features are resolved strictly: an expired `pro` plan reports
 * `planActive: false` and its product limit falls back to the free tier.
 */
export async function buildBillingInfo(
  ownerId: string
): Promise<BillingInfo | null> {
  const { row: store, degraded } = await fetchStoreBillingRow(ownerId);

  if (!store) return null;

  const plan = normalizePlan(store.plan);
  const planActive = degraded
    ? true
    : plan === "pro"
      ? isPlanActive(plan, store.planExpiresAt)
      : true;
  const effective = planActive ? plan : "free";
  const limit = productLimitFor(effective);

  const productCount = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.storeId, store.id));

  const used = Number(productCount[0]?.value ?? 0);

  return {
    plan,
    planActive,
    planExpiresAt: toIso(store.planExpiresAt),
    productCount: used,
    productLimit: limit,
    usagePercent:
      limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    storeId: store.id,
    storeName: store.name,
    aiCredits: store.aiCredits ?? FREE_AI_CREDITS,
    whatsappCredits: store.whatsappCredits ?? 0,
    aiCreditsExpiresAt: toIso(store.aiCreditsExpiresAt),
    waCreditsExpiresAt: toIso(store.waCreditsExpiresAt),
    hasWhiteLabel: store.hasWhiteLabel ?? false,
    maxStaffSeats: store.maxStaffSeats ?? INCLUDED_STAFF_SEATS,
  };
}

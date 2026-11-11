import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { stores, storeMembers, users } from "@/db/schema";
import {
  evaluateStorehubEntitlement,
  type ProductAccess,
} from "@/lib/products";

/**
 * Does `userId` still have access to `storeId` right now?
 *
 * JWTs carry a `storeId` claim that can go stale (store deleted, team member
 * removed). This checks ground truth: the store must exist AND the user must
 * be its owner or an active `store_members` row. Safe to call from middleware
 * (no next/headers dependency).
 */
export async function hasStoreAccess(
  userId: string,
  storeId: string
): Promise<boolean> {
  if (!userId || !storeId) return false;

  const storeRow = await db
    .select({ ownerId: stores.ownerId })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  const store = storeRow[0];
  if (!store) return false;
  if (store.ownerId === userId) return true;

  const membership = await db
    .select({ id: storeMembers.id })
    .from(storeMembers)
    .where(
      and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, userId)
      )
    )
    .limit(1);

  return membership.length > 0;
}

const STORED_STATUSES = new Set(["none", "trial", "active", "expired"]);

function sanitizeStoredAccess(raw: unknown): ProductAccess | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (typeof status !== "string" || !STORED_STATUSES.has(status)) {
    return undefined;
  }
  return {
    status: status as ProductAccess["status"],
    onboardingCompleted: record.onboardingCompleted === true,
    ...(typeof record.currentPeriodEnd === "string"
      ? { currentPeriodEnd: record.currentPeriodEnd }
      : {}),
    ...(record.waitlisted === true ? { waitlisted: true } : {}),
  };
}

/**
 * Effective StoreHub entitlement for `userId` scoped to `storeId`.
 * Returns `null` when the user has no access to that store (stale claim) —
 * callers must treat null as "no store context", never as expired.
 * Used by the proxy for the /billing redirect and the API write gate.
 */
export async function getStorehubEntitlement(
  userId: string,
  storeId: string
): Promise<ProductAccess | null> {
  if (!userId || !storeId) return null;

  const storeRow = await db
    .select({ ownerId: stores.ownerId, createdAt: stores.createdAt })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  const store = storeRow[0];
  if (!store) return null;

  if (store.ownerId !== userId) {
    const membership = await db
      .select({ id: storeMembers.id })
      .from(storeMembers)
      .where(
        and(
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.userId, userId)
        )
      )
      .limit(1);
    if (membership.length === 0) return null;
  }

  // The paid period lives on the store OWNER's products map — members ride
  // on it, so always read the owner's row (ownerId === userId for owners).
  const userRow = await db
    .select({ products: users.products })
    .from(users)
    .where(eq(users.id, store.ownerId))
    .limit(1);

  const products = userRow[0]?.products as Record<string, unknown> | null;
  const stored = sanitizeStoredAccess(products?.storehub);

  return evaluateStorehubEntitlement({
    stored,
    hasStore: true,
    storeCreatedAt: store.createdAt,
  });
}

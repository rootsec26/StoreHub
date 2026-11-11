import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { resolveStoreAccess } from "@/lib/auth";
import {
  PRODUCT_KEYS,
  evaluateStorehubEntitlement,
  getProductEntryRoute,
  hasProductAccess,
  isProductKey,
  type ProductAccess,
  type ProductKey,
  type UserProductMap,
} from "@/lib/products";

const EMPTY_MAP: UserProductMap = {};

/** Pool handle or a `db.transaction(...)` handle. */
type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

function normalizeProductMap(raw: unknown): UserProductMap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const map: UserProductMap = {};
  for (const key of PRODUCT_KEYS) {
    const entry = (raw as Record<string, unknown>)[key];
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const status = record.status;
    if (
      status !== "none" &&
      status !== "trial" &&
      status !== "active" &&
      status !== "expired"
    ) {
      continue;
    }
    map[key] = {
      status,
      onboardingCompleted: record.onboardingCompleted === true,
      ...(typeof record.currentPeriodEnd === "string"
        ? { currentPeriodEnd: record.currentPeriodEnd }
        : {}),
      ...(record.waitlisted === true ? { waitlisted: true } : {}),
    };
  }
  return map;
}

async function readUserProductRow(userId: string) {
  const rows = await db
    .select({
      products: users.products,
      lastUsedProduct: users.lastUsedProduct,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Effective per-user product access. The persisted `users.products` map is
 * merged with ground truth: owning/member-of a store always grants StoreHub
 * `active` + `onboardingCompleted` (backward compatible — existing merchants
 * need no migration of access state).
 */
export async function getUserProductState(userId: string): Promise<{
  products: UserProductMap;
  lastUsedProduct: ProductKey | null;
  /** User owns or belongs to a store (any role). */
  hasStore: boolean;
  /** User is staff/admin of someone else's store (not the owner). */
  isStoreMember: boolean;
}> {
  const [row, access] = await Promise.all([
    readUserProductRow(userId),
    resolveStoreAccess(userId),
  ]);

  const stored = normalizeProductMap(row?.products);
  const products: UserProductMap = { ...stored };
  const isStoreMember = Boolean(access && access.store.ownerId !== userId);

  // StoreHub entitlement is computed (not just stored): paid period +
  // grace windows are evaluated lazily at read time. Members ride on the
  // STORE OWNER's paid period — their own products.storehub is ignored.
  let storedStorehub = stored.storehub;
  if (isStoreMember && access) {
    const ownerRow = await db
      .select({ products: users.products })
      .from(users)
      .where(eq(users.id, access.store.ownerId))
      .limit(1);
    storedStorehub = normalizeProductMap(ownerRow[0]?.products).storehub;
  }
  products.storehub = evaluateStorehubEntitlement({
    stored: storedStorehub,
    hasStore: Boolean(access),
    storeCreatedAt: access?.store.createdAt ?? null,
  });

  // Persist the one-time trial end on first evaluation so it is granted
  // exactly once (never re-granted or sliding). Only for the store OWNER —
  // a member's computed entitlement must never be written into their own
  // products map.
  if (
    access &&
    !isStoreMember &&
    !storedStorehub?.currentPeriodEnd &&
    products.storehub.currentPeriodEnd &&
    (products.storehub.status === "trial" || products.storehub.status === "expired")
  ) {
    products.storehub = {
      ...products.storehub,
      currentPeriodEnd: products.storehub.currentPeriodEnd,
    };
    const map = { ...products } as Record<string, unknown>;
    await db
      .update(users)
      .set({ products: map })
      .where(eq(users.id, userId))
      .catch(() => undefined);
  }

  const lastUsed = row?.lastUsedProduct;
  return {
    products,
    lastUsedProduct: isProductKey(lastUsed) ? lastUsed : null,
    hasStore: Boolean(access),
    isStoreMember,
  };
}

/**
 * Central StoreHub landing rule (pay-first flow) — the single source used
 * by /select-product, /api/hub/enter, the proxy and /billing:
 *   no paid access + no store   -> /billing
 *   paid access   + no store    -> /onboarding
 *   paid access   + store       -> /dashboard   (owner or team member)
 *   store but lapsed/never paid -> /billing
 */
export type StorehubLanding = "/billing" | "/onboarding" | "/dashboard";

export async function resolveStorehubLanding(userId: string): Promise<{
  route: StorehubLanding;
  hasStore: boolean;
  isStoreMember: boolean;
  status: ProductAccess["status"] | "unknown";
}> {
  const state = await getUserProductState(userId);
  const status = state.products.storehub?.status ?? "unknown";
  const paid = status === "active";
  const route: StorehubLanding = !state.hasStore
    ? paid
      ? "/onboarding"
      : "/billing"
    : paid
      ? "/dashboard"
      : "/billing";
  return {
    route,
    hasStore: state.hasStore,
    isStoreMember: state.isStoreMember,
    status,
  };
}

export async function hasUserProductAccess(
  userId: string,
  key: ProductKey
): Promise<boolean> {
  const { products } = await getUserProductState(userId);
  return hasProductAccess(products, key);
}

/** Route the user should land on for `key`, honouring onboarding state. */
export async function getUserProductEntryRoute(
  userId: string,
  key: ProductKey
): Promise<string | null> {
  const { products } = await getUserProductState(userId);
  return getProductEntryRoute(products, key);
}

async function writeProductEntry(
  userId: string,
  key: ProductKey,
  entry: ProductAccess
): Promise<void> {
  const row = await readUserProductRow(userId);
  const map = normalizeProductMap(row?.products);
  map[key] = entry;
  await db
    .update(users)
    .set({ products: map as Record<string, unknown> })
    .where(eq(users.id, userId));
}

/**
 * First-time selection of an available product: grants `trial` access.
 * Existing `active`/`trial` entries are left untouched.
 */
export async function activateProduct(
  userId: string,
  key: ProductKey
): Promise<ProductAccess> {
  const row = await readUserProductRow(userId);
  const map = normalizeProductMap(row?.products);
  const existing = map[key];
  if (existing && existing.status !== "none") {
    return existing;
  }
  const entry: ProductAccess = {
    status: "trial",
    onboardingCompleted: false,
  };
  await writeProductEntry(userId, key, entry);
  return entry;
}

export async function markProductOnboardingComplete(
  userId: string,
  key: ProductKey
): Promise<void> {
  const row = await readUserProductRow(userId);
  const map = normalizeProductMap(row?.products);
  const existing = map[key];
  map[key] = {
    // Never grant paid 'active' here — paid status only comes from admin
    // approval of a payment_request. Onboarding completion keeps whatever
    // status the entitlement evaluator will compute anyway.
    status:
      existing?.status && existing.status !== "none" ? existing.status : "trial",
    onboardingCompleted: true,
    ...(existing?.currentPeriodEnd
      ? { currentPeriodEnd: existing.currentPeriodEnd }
      : {}),
    ...(existing?.waitlisted ? { waitlisted: true } : {}),
  };
  await db
    .update(users)
    .set({ products: map as Record<string, unknown> })
    .where(eq(users.id, userId));
}

/**
 * Extends a user's StoreHub paid period by `durationDays`, anchored at the
 * later of (now, existing currentPeriodEnd) so renewals stack. MUST run
 * inside a transaction — the user row is locked FOR UPDATE. This is the
 * single code path used by BOTH payment approval and manual admin grants,
 * so entitlement rules stay identical.
 * Returns the new currentPeriodEnd ISO string.
 */
export async function extendStorehubPaidPeriod(
  tx: DbExecutor,
  userId: string,
  durationDays: number
): Promise<string> {
  const now = Date.now();
  const days = Number.isFinite(durationDays) && durationDays > 0
    ? Math.floor(durationDays)
    : 30;

  const userRows = await tx
    .select({ products: users.products })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);
  const products =
    (userRows[0]?.products as Record<string, unknown> | null) ?? {};
  const existing =
    (products.storehub as Record<string, unknown> | undefined) ?? {};
  const existingEnd =
    typeof existing.currentPeriodEnd === "string"
      ? new Date(existing.currentPeriodEnd).getTime()
      : null;
  const base = existingEnd !== null && existingEnd > now ? existingEnd : now;
  const newEnd = new Date(
    base + days * 24 * 60 * 60 * 1000
  ).toISOString();

  await tx
    .update(users)
    .set({
      products: {
        ...products,
        storehub: {
          status: "active",
          onboardingCompleted: true,
          currentPeriodEnd: newEnd,
        },
      },
    })
    .where(eq(users.id, userId));

  return newEnd;
}

export async function setLastUsedProduct(
  userId: string,
  key: ProductKey
): Promise<void> {
  await db
    .update(users)
    .set({ lastUsedProduct: key })
    .where(eq(users.id, userId));
}

/** "Notify me" flag for coming-soon products. */
export async function joinProductWaitlist(
  userId: string,
  key: ProductKey
): Promise<void> {
  const row = await readUserProductRow(userId);
  const map = normalizeProductMap(row?.products);
  const existing = map[key];
  map[key] = {
    status: existing?.status ?? "none",
    onboardingCompleted: existing?.onboardingCompleted ?? false,
    waitlisted: true,
  };
  await db
    .update(users)
    .set({ products: map as Record<string, unknown> })
    .where(eq(users.id, userId));
}

export { EMPTY_MAP as EMPTY_PRODUCT_MAP };

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  orders,
  stores,
  users,
  type NotificationAudienceFilter,
  type NotificationAudienceType,
} from "@/db/schema";

export interface AudienceRecipient {
  key: string;
  recipientType: "CUSTOMER" | "MERCHANT";
  customerId: string | null;
  userId: string | null;
  storeId: string | null;
  name: string;
  phone: string;
  email: string;
}

/** Digits-only phone used for dedupe and WhatsApp delivery. */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^\d]/g, "").slice(0, 15);
}

function isValidPhone(phone: string): boolean {
  return phone.length >= 8 && phone.length <= 15;
}

interface CustomerCandidate {
  customerId: string | null;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  totalSpent: number;
  vipTierId: string | null;
  lastOrderAt: Date | null;
}

function mergeCustomerCandidates(
  base: Map<string, CustomerCandidate>,
  candidate: CustomerCandidate
): void {
  const existing = base.get(candidate.phone);
  if (!existing) {
    base.set(candidate.phone, candidate);
    return;
  }

  // Prefer the real customer row (it carries loyalty data and an id), while
  // keeping the freshest order information.
  const preferred =
    candidate.customerId && !existing.customerId ? candidate : existing;
  const other = preferred === candidate ? existing : candidate;

  preferred.totalSpent = Math.max(preferred.totalSpent, other.totalSpent);
  if (
    other.lastOrderAt &&
    (!preferred.lastOrderAt || other.lastOrderAt > preferred.lastOrderAt)
  ) {
    preferred.lastOrderAt = other.lastOrderAt;
  }
  if (!preferred.email && other.email) preferred.email = other.email;
  if (!preferred.name && other.name) preferred.name = other.name;
  base.set(candidate.phone, preferred);
}

export async function resolveCustomerAudience(
  storeId: string,
  audienceType: NotificationAudienceType,
  filter: NotificationAudienceFilter
): Promise<AudienceRecipient[]> {
  if (
    audienceType !== "ALL_CUSTOMERS" &&
    audienceType !== "SELECTED_CUSTOMERS" &&
    audienceType !== "CUSTOMER_SEGMENT"
  ) {
    return [];
  }

  const [customerRows, orderRows] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        loyaltyPoints: customers.loyaltyPoints,
        totalLifetimeSpend: customers.totalLifetimeSpend,
        vipTierId: customers.currentVipTierId,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(eq(customers.storeId, storeId)),
    db
      .select({
        phone: orders.customerPhone,
        name: sql<string>`max(${orders.customerName})`,
        totalSpent: sql<string>`coalesce(sum(${orders.totalAmount}) filter (where ${orders.status} in ('DELIVERED', 'COMPLETED')), 0)::text`,
        lastOrderAt: sql<string | null>`max(${orders.createdAt})::text`,
      })
      .from(orders)
      .where(eq(orders.storeId, storeId))
      .groupBy(orders.customerPhone),
  ]);

  const candidates = new Map<string, CustomerCandidate>();

  // Order contacts first, then customer rows override / enrich them.
  for (const row of orderRows) {
    const phone = normalizePhone(row.phone);
    if (!isValidPhone(phone)) continue;
    mergeCustomerCandidates(candidates, {
      customerId: null,
      name: row.name ?? "",
      phone,
      email: "",
      loyaltyPoints: 0,
      totalSpent: Number(row.totalSpent) || 0,
      vipTierId: null,
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt) : null,
    });
  }

  for (const row of customerRows) {
    const phone = normalizePhone(row.phone);
    if (!isValidPhone(phone)) continue;
    mergeCustomerCandidates(candidates, {
      customerId: row.id,
      name: row.name ?? "",
      phone,
      email: row.email ?? "",
      loyaltyPoints: row.loyaltyPoints ?? 0,
      totalSpent: Number(row.totalLifetimeSpend) || 0,
      vipTierId: row.vipTierId,
      lastOrderAt: null,
    });
  }

  let list = Array.from(candidates.values());

  if (audienceType === "SELECTED_CUSTOMERS") {
    const selected = new Set(filter.customerIds ?? []);
    list = list.filter(
      (row) => row.customerId !== null && selected.has(row.customerId)
    );
  }

  if (audienceType === "CUSTOMER_SEGMENT") {
    if (filter.minSpend !== undefined) {
      list = list.filter((row) => row.totalSpent >= (filter.minSpend ?? 0));
    }
    if (filter.loyaltyPoints !== undefined) {
      list = list.filter(
        (row) => row.loyaltyPoints >= (filter.loyaltyPoints ?? 0)
      );
    }
    if (filter.vipTierId) {
      list = list.filter((row) => row.vipTierId === filter.vipTierId);
    }
    if (filter.lastOrderDays !== undefined) {
      const cutoff = Date.now() - filter.lastOrderDays * 24 * 60 * 60 * 1000;
      list = list.filter(
        (row) => row.lastOrderAt !== null && row.lastOrderAt.getTime() >= cutoff
      );
    }
  }

  return list
    .map((row) => ({
      key: row.customerId ? `customer:${row.customerId}` : `customer:phone:${row.phone}`,
      recipientType: "CUSTOMER" as const,
      customerId: row.customerId,
      userId: null,
      storeId,
      name: row.name || row.phone,
      phone: row.phone,
      email: row.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveMerchantAudience(
  audienceType: NotificationAudienceType,
  filter: NotificationAudienceFilter
): Promise<AudienceRecipient[]> {
  if (
    audienceType !== "ALL_MERCHANTS" &&
    audienceType !== "SELECTED_MERCHANTS" &&
    audienceType !== "MERCHANT_PLAN"
  ) {
    return [];
  }

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      storeId: stores.id,
      storeName: stores.name,
      plan: stores.plan,
      storeCreatedAt: stores.createdAt,
    })
    .from(users)
    .innerJoin(stores, eq(stores.ownerId, users.id))
    .orderBy(stores.createdAt);

  // One inbox row per owner; keep their oldest store as the display store.
  const byUser = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, row);
  }

  let list = Array.from(byUser.values());

  if (audienceType === "SELECTED_MERCHANTS") {
    const selected = new Set(filter.merchantIds ?? []);
    list = list.filter((row) => selected.has(row.userId));
  }

  if (audienceType === "MERCHANT_PLAN") {
    list = list.filter((row) => row.plan === filter.plan);
  }

  return list.map((row) => ({
    key: `user:${row.userId}`,
    recipientType: "MERCHANT" as const,
    customerId: null,
    userId: row.userId,
    storeId: row.storeId,
    name: row.name || row.email,
    phone: "",
    email: row.email,
  }));
}

export async function getWhatsAppCreditBalance(
  storeId: string
): Promise<number | null> {
  const rows = await db
    .select({ credits: stores.whatsappCredits })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  return rows.length > 0 ? rows[0].credits : null;
}

import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  notifications,
  orders,
  products,
  stores,
  users,
} from "@/db/schema";
import { isValidUuid } from "@/lib/storefront";

export const ADMIN_ACTIVITY_TYPES = [
  "STORE_CREATED",
  "USER_REGISTERED",
  "PRODUCT_CREATED",
  "ORDER_CREATED",
  "MESSAGE_SENT",
] as const;

export type AdminActivityType = (typeof ADMIN_ACTIVITY_TYPES)[number];

export interface AdminActivityEvent {
  id: string;
  type: AdminActivityType;
  title: string;
  description: string;
  actorName: string | null;
  storeId: string | null;
  storeName: string | null;
  storeSlug: string | null;
  createdAt: string;
}

export interface AdminActivityResponse {
  events: AdminActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
}

const FETCH_PER_SOURCE = 80;

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listAdminActivity(options: {
  type?: string;
  storeId?: string;
  q?: string;
  page: number;
  limit: number;
}): Promise<AdminActivityResponse> {
  const storeFilter =
    options.storeId && isValidUuid(options.storeId) ? options.storeId : null;
  const type = ADMIN_ACTIVITY_TYPES.includes(options.type as AdminActivityType)
    ? (options.type as AdminActivityType)
    : null;
  const q = options.q?.trim();

  const events: AdminActivityEvent[] = [];

  if (!type || type === "STORE_CREATED") {
    const conditions = storeFilter ? [eq(stores.id, storeFilter)] : [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(or(ilike(stores.name, pattern), ilike(stores.slug, pattern))!);
    }
    const rows = await db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        createdAt: stores.createdAt,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(stores)
      .leftJoin(users, eq(users.id, stores.ownerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(stores.createdAt))
      .limit(FETCH_PER_SOURCE);

    for (const row of rows) {
      events.push({
        id: `store:${row.id}`,
        type: "STORE_CREATED",
        title: "Store created",
        description: `${row.name} (${row.slug})`,
        actorName: row.ownerName || row.ownerEmail || null,
        storeId: row.id,
        storeName: row.name,
        storeSlug: row.slug,
        createdAt: iso(row.createdAt),
      });
    }
  }

  if (!type || type === "USER_REGISTERED") {
    // User signups are platform-level; only include them when no store filter is active.
    if (!storeFilter) {
      const conditions = [];
      if (q) {
        const pattern = `%${q}%`;
        conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
      }
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(FETCH_PER_SOURCE);

      for (const row of rows) {
        events.push({
          id: `user:${row.id}`,
          type: "USER_REGISTERED",
          title: "User registered",
          description: row.email,
          actorName: row.name || row.email,
          storeId: null,
          storeName: null,
          storeSlug: null,
          createdAt: iso(row.createdAt),
        });
      }
    }
  }

  if (!type || type === "PRODUCT_CREATED") {
    const conditions = storeFilter ? [eq(products.storeId, storeFilter)] : [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(ilike(products.name, pattern), ilike(products.sku, pattern))!
      );
    }
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        createdAt: products.createdAt,
        storeId: stores.id,
        storeName: stores.name,
        storeSlug: stores.slug,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(products.createdAt))
      .limit(FETCH_PER_SOURCE);

    for (const row of rows) {
      events.push({
        id: `product:${row.id}`,
        type: "PRODUCT_CREATED",
        title: "Product added",
        description: row.sku ? `${row.name} · SKU ${row.sku}` : row.name,
        actorName: null,
        storeId: row.storeId,
        storeName: row.storeName,
        storeSlug: row.storeSlug,
        createdAt: iso(row.createdAt),
      });
    }
  }

  if (!type || type === "ORDER_CREATED") {
    const conditions = storeFilter ? [eq(orders.storeId, storeFilter)] : [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(orders.customerName, pattern),
          ilike(orders.customerPhone, pattern),
          ilike(stores.name, pattern)
        )!
      );
    }
    const rows = await db
      .select({
        id: orders.id,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        totalAmount: orders.totalAmount,
        status: orders.status,
        createdAt: orders.createdAt,
        storeId: stores.id,
        storeName: stores.name,
        storeSlug: stores.slug,
      })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(FETCH_PER_SOURCE);

    for (const row of rows) {
      events.push({
        id: `order:${row.id}`,
        type: "ORDER_CREATED",
        title: "Order placed",
        description: `${row.customerName || "Customer"}${row.customerPhone ? ` · ${row.customerPhone}` : ""} · ${row.totalAmount}`,
        actorName: row.customerName || null,
        storeId: row.storeId,
        storeName: row.storeName,
        storeSlug: row.storeSlug,
        createdAt: iso(row.createdAt),
      });
    }
  }

  if (!type || type === "MESSAGE_SENT") {
    const conditions = storeFilter ? [eq(notifications.storeId, storeFilter)] : [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(notifications.title, pattern),
          ilike(notifications.body, pattern),
          ilike(stores.name, pattern)
        )!
      );
    }
    const rows = await db
      .select({
        id: notifications.id,
        title: notifications.title,
        status: notifications.status,
        recipientCount: notifications.recipientCount,
        createdAt: notifications.createdAt,
        storeId: stores.id,
        storeName: stores.name,
        storeSlug: stores.slug,
        senderName: users.name,
      })
      .from(notifications)
      .leftJoin(stores, eq(stores.id, notifications.storeId))
      .leftJoin(users, eq(users.id, notifications.createdByUserId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(FETCH_PER_SOURCE);

    for (const row of rows) {
      events.push({
        id: `message:${row.id}`,
        type: "MESSAGE_SENT",
        title: row.title || "Message sent",
        description: `${row.recipientCount} recipient${row.recipientCount === 1 ? "" : "s"} · ${row.status}`,
        actorName: row.senderName || null,
        storeId: row.storeId,
        storeName: row.storeName,
        storeSlug: row.storeSlug,
        createdAt: iso(row.createdAt),
      });
    }
  }

  const filtered = events
    .filter((event) => !type || event.type === type)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const offset = (options.page - 1) * options.limit;
  return {
    events: filtered.slice(offset, offset + options.limit),
    total: filtered.length,
    page: options.page,
    pageSize: options.limit,
  };
}

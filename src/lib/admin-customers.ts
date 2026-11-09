import "server-only";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  orderItems,
  orders,
  products,
  stores,
} from "@/db/schema";
import { isValidUuid } from "@/lib/storefront";

export interface AdminCustomerOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  imageUrl: string | null;
}

export interface AdminCustomerOrder {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: string;
  createdAt: string;
  items: AdminCustomerOrderItem[];
}

export interface AdminCustomerRow {
  key: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  phone: string;
  name: string;
  email: string;
  address: string;
  loyaltyPoints: number;
  lifetimeSpend: string;
  totalOrders: number;
  completedOrders: number;
  totalSpent: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface AdminCustomersResponse {
  customers: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listAdminCustomers(options: {
  q?: string;
  storeId?: string;
  page: number;
  limit: number;
}): Promise<AdminCustomersResponse> {
  const conditions = [];
  if (options.storeId && isValidUuid(options.storeId)) {
    conditions.push(eq(orders.storeId, options.storeId));
  }
  if (options.q) {
    const pattern = `%${options.q}%`;
    conditions.push(
      or(
        ilike(orders.customerName, pattern),
        ilike(orders.customerPhone, pattern),
        ilike(orders.customerAddress, pattern),
        ilike(stores.name, pattern),
        ilike(stores.slug, pattern)
      )
    );
  }

  const rows = await db
    .select({
      storeId: orders.storeId,
      phone: orders.customerPhone,
      name: sql<string>`max(${orders.customerName})`,
      address: sql<string>`max(${orders.customerAddress})`,
      customerRecordName: sql<string | null>`max(${customers.name})`,
      email: sql<string | null>`max(${customers.email})`,
      loyaltyPoints: sql<number | null>`max(${customers.loyaltyPoints})`,
      lifetimeSpend: sql<string | null>`max(${customers.totalLifetimeSpend})::text`,
      totalOrders: sql<number>`count(*)::int`,
      completedOrders: sql<number>`count(*) filter (where ${orders.status} = 'DELIVERED')::int`,
      totalSpent: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
      firstOrderAt: sql<string | null>`min(${orders.createdAt})::text`,
      lastOrderAt: sql<string | null>`max(${orders.createdAt})::text`,
      storeName: stores.name,
      storeSlug: stores.slug,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .leftJoin(
      customers,
      and(
        eq(customers.storeId, orders.storeId),
        eq(customers.phone, orders.customerPhone)
      )
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(orders.storeId, orders.customerPhone, stores.id)
    .orderBy(desc(sql`max(${orders.createdAt})`));

  const mapped: AdminCustomerRow[] = rows.map((row) => {
    const phone = row.phone ?? "";
    return {
      key: `${row.storeId}:${phone || "no-phone"}`,
      storeId: row.storeId,
      storeName: row.storeName ?? "—",
      storeSlug: row.storeSlug ?? "",
      phone,
      name: row.customerRecordName || row.name || "—",
      email: row.email ?? "",
      address: row.address ?? "",
      loyaltyPoints: Number(row.loyaltyPoints ?? 0),
      lifetimeSpend: String(row.lifetimeSpend ?? "0"),
      totalOrders: Number(row.totalOrders ?? 0),
      completedOrders: Number(row.completedOrders ?? 0),
      totalSpent: String(row.totalSpent ?? "0"),
      firstOrderAt: iso(row.firstOrderAt),
      lastOrderAt: iso(row.lastOrderAt),
    };
  });

  const offset = (options.page - 1) * options.limit;
  return {
    customers: mapped.slice(offset, offset + options.limit),
    total: mapped.length,
    page: options.page,
    pageSize: options.limit,
  };
}

export async function listAdminCustomerOrders(options: {
  storeId: string;
  phone: string;
  limit?: number;
}): Promise<AdminCustomerOrder[]> {
  if (!isValidUuid(options.storeId)) return [];
  const phone = options.phone.trim().slice(0, 80);
  if (!phone) return [];

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, options.storeId), eq(orders.customerPhone, phone)))
    .orderBy(desc(orders.createdAt))
    .limit(Math.min(options.limit ?? 30, 100));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => row.id);
  const itemRows = await db
    .select({
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      productName: products.name,
      imageUrl: products.imageUrl,
    })
    .from(orderItems)
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.id));

  const itemsByOrder = new Map<string, AdminCustomerOrderItem[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      productId: item.productId,
      productName: item.productName ?? "Product",
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      imageUrl: item.imageUrl ?? null,
    });
    itemsByOrder.set(item.orderId, list);
  }

  return orderRows.map((order) => ({
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: String(order.totalAmount),
    createdAt: order.createdAt.toISOString(),
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

import "server-only";

import { cache } from "react";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, products, stores } from "@/db/schema";

export type StoreRecord = typeof stores.$inferSelect;
export type ProductRecord = typeof products.$inferSelect;
export type CategoryRecord = typeof categories.$inferSelect;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const getStoreBySlug = cache(
  async (slug: string): Promise<StoreRecord | null> => {
    if (!slug || slug.length > 80 || !SLUG_PATTERN.test(slug)) return null;

    const rows = await db
      .select()
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    return rows[0] ?? null;
  }
);

export const getStoreProducts = cache(
  async (storeId: string): Promise<ProductRecord[]> => {
    if (!storeId || !isValidUuid(storeId)) return [];

    return db
      .select()
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.isVisible, true)))
      .orderBy(asc(products.createdAt));
  }
);

export const getStoreCategories = cache(
  async (storeId: string): Promise<CategoryRecord[]> => {
    if (!storeId || !isValidUuid(storeId)) return [];

    return db
      .select()
      .from(categories)
      .where(eq(categories.storeId, storeId))
      .orderBy(asc(categories.createdAt));
  }
);

export async function getStoreProduct(
  storeId: string,
  productId: string
): Promise<ProductRecord | null> {
  if (!storeId || !isValidUuid(storeId)) return null;
  if (!productId || !isValidUuid(productId)) return null;

  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        eq(products.id, productId),
        eq(products.isVisible, true)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getCategoryName(
  categoryId: string | null
): Promise<string | null> {
  if (!categoryId || !isValidUuid(categoryId)) return null;

  const rows = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  return rows[0]?.name ?? null;
}

export async function getSitemapStores(): Promise<
  { slug: string; createdAt: Date }[]
> {
  return db
    .select({ slug: stores.slug, createdAt: stores.createdAt })
    .from(stores)
    .orderBy(desc(stores.createdAt));
}

export async function getSitemapProducts(
  limit = 2000
): Promise<{ storeSlug: string; productId: string }[]> {
  return db
    .select({ storeSlug: stores.slug, productId: products.id })
    .from(products)
    .innerJoin(stores, eq(products.storeId, stores.id))
    .where(eq(products.isVisible, true))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

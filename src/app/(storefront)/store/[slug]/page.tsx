import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";

import { stores, products, categories } from "@/db/schema";
import { SITE_NAME, absoluteUrl, storePath } from "@/lib/site";
import { normalizeAccent } from "@/lib/theme";
import type {
  StoreData,
  ProductData,
  CategoryData,
} from "./storefront-view";
import { resolveThemeConfig } from "@/lib/theme-config";
import { getStorePromotions } from "@/lib/storefront";
import StorefrontRenderer from "./storefront-renderer";

const FALLBACK_CURRENCY = "EGP";
const FALLBACK_SUPPORTED_CURRENCIES = ["EGP", "USD", "SAR", "AED", "EUR"];

function notFoundMetadata(): Metadata {
  return {
    title: "Store Not Found",
    description: "The store you're looking for doesn't exist.",
    robots: { index: false, follow: false },
  };
}

function safeCurrency(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 3) return trimmed.toUpperCase();
  }
  return FALLBACK_CURRENCY;
}

function safeSupportedCurrencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    const list = value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length === 3)
      .map((entry) => entry.trim().toUpperCase());
    if (list.length > 0) return list;
  }
  return FALLBACK_SUPPORTED_CURRENCIES;
}

async function fetchStoreBySlug(slug: string) {
  try {
    const rows = await db
      .select()
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);
    return rows[0];
  } catch (error) {
    console.error(`Failed to fetch store "${slug}":`, error);
    return undefined;
  }
}

async function fetchProducts(storeId: string) {
  return db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      stock: products.stock,
      imageUrl: products.imageUrl,
      categoryId: products.categoryId,
      isVisible: products.isVisible,
    })
    .from(products)
    .where(eq(products.storeId, storeId));
}

async function fetchCategories(storeId: string) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
    })
    .from(categories)
    .where(eq(categories.storeId, storeId));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const storeData = await fetchStoreBySlug(slug);

  if (!storeData) {
    return notFoundMetadata();
  }

  const storeRow = storeData;
  const accent = normalizeAccent(storeRow.accentColor);
  const url = absoluteUrl(storePath(storeRow.slug));
  const image = storeRow.coverUrl || storeRow.logoUrl || undefined;

  return {
    title: storeRow.name,
    description: `Shop ${storeRow.name} products, prices and offers. Order online through the ${SITE_NAME} storefront.`,
    keywords: [storeRow.name, storeRow.category || "", "online store"].filter(Boolean),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: storeRow.name,
      description: `Shop ${storeRow.name} products, prices and offers. Order online through the ${SITE_NAME} storefront.`,
      url,
      ...(image ? { images: [{ url: image, alt: storeRow.name }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: storeRow.name,
      description: `Shop ${storeRow.name} products, prices and offers. Order online through the ${SITE_NAME} storefront.`,
      ...(image ? { images: [image] } : {}),
    },
    other: { "theme-color": accent },
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storeRow = await fetchStoreBySlug(slug);
  if (!storeRow) notFound();

  const currency = safeCurrency(storeRow.currency);
  const supportedCurrencies = safeSupportedCurrencies(storeRow.supportedCurrencies);

  // Fetch products and categories using Drizzle
  let productRows: Awaited<ReturnType<typeof fetchProducts>> = [];
  try {
    productRows = await fetchProducts(storeRow.id);
  } catch (error) {
    console.error(`Failed to fetch products for store "${slug}":`, error);
  }

  let categoryRows: Awaited<ReturnType<typeof fetchCategories>> = [];
  try {
    categoryRows = await fetchCategories(storeRow.id);
  } catch (error) {
    console.error(`Failed to fetch categories for store "${slug}":`, error);
  }

  const promotionRecords = await getStorePromotions(storeRow.id);

  const storeData: StoreData = {
    id: storeRow.id,
    name: storeRow.name,
    slug: storeRow.slug,
    description: storeRow.description ?? "",
    category: storeRow.category ?? "",
    logoUrl: storeRow.logoUrl ?? "",
    coverUrl: storeRow.coverUrl ?? "",
    phone: storeRow.phone ?? "",
    address: storeRow.address ?? "",
    accentColor: storeRow.accentColor ?? "",
    currency,
    supportedCurrencies,
    hasWhiteLabel: storeRow.hasWhiteLabel ?? false,
    themeConfig: resolveThemeConfig(storeRow.themeConfig),
  };

  const productData: ProductData[] = productRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price: String(row.price),
    stock: row.stock,
    imageUrl: row.imageUrl ?? "",
    categoryId: row.categoryId,
    isVisible: row.isVisible ?? true,
  }));

  const categoryData: CategoryData[] = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  const url = absoluteUrl(storePath(storeRow.slug));
  const image = storeRow.coverUrl || storeRow.logoUrl || undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: storeRow.name,
    description: `${storeRow.name} store`,
    url,
    ...(image ? { image } : {}),
    ...(storeRow.phone ? { telephone: storeRow.phone } : {}),
    ...(storeRow.address
      ? { address: { "@type": "PostalAddress", streetAddress: storeRow.address } }
      : {}),
    ...(storeRow.category ? { category: storeRow.category } : {}),
    priceRange: currency,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <StorefrontRenderer
        storeId={storeRow.id}
        store={storeData}
        products={productData}
        categories={categoryData}
        initialPromotions={promotionRecords}
      />
    </>
  );
}
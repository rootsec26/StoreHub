import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getStoreBySlug,
  getStoreCategories,
  getStoreProducts,
  type ProductRecord,
  type StoreRecord,
} from "@/lib/storefront";
import { SITE_NAME, absoluteUrl, storePath } from "@/lib/site";
import { normalizeAccent } from "@/lib/theme";
import StorefrontView, {
  type CategoryData,
  type ProductData,
  type StoreData,
} from "./storefront-view";

interface StorePageProps {
  params: Promise<{ slug: string }>;
}

function buildDescription(store: {
  name: string;
  description: string | null;
  category: string | null;
}): string {
  if (store.description) return store.description.slice(0, 300);
  const category = store.category ? ` ${store.category.toLowerCase()}` : "";
  return `Shop ${store.name}${category} products, prices and offers. Order online through the ${SITE_NAME} storefront.`;
}

export async function generateMetadata({
  params,
}: StorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);

  if (!store) {
    return {
      title: "Store Not Found",
      description: "The store you're looking for doesn't exist.",
      robots: { index: false, follow: false },
    };
  }

  const accent = normalizeAccent(store.accentColor);
  const description = buildDescription(store);
  const url = absoluteUrl(storePath(store.slug));
  const image = store.coverUrl || store.logoUrl || undefined;

  return {
    title: store.name,
    description,
    keywords: [store.name, store.category || "", "online store"].filter(Boolean),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: store.name,
      description,
      url,
      ...(image ? { images: [{ url: image, alt: store.name }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: store.name,
      description,
      ...(image ? { images: [image] } : {}),
    },
    other: { "theme-color": accent },
  };
}

function toStoreData(store: StoreRecord): StoreData {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description ?? "",
    category: store.category ?? "",
    logoUrl: store.logoUrl ?? "",
    coverUrl: store.coverUrl ?? "",
    phone: store.phone ?? "",
    address: store.address ?? "",
    accentColor: store.accentColor ?? "",
  };
}

function toProductData(row: ProductRecord): ProductData {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price: row.price,
    stock: row.stock,
    imageUrl: row.imageUrl ?? "",
    categoryId: row.categoryId,
    isVisible: row.isVisible ?? true,
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const [products, categories] = await Promise.all([
    getStoreProducts(store.id),
    getStoreCategories(store.id),
  ]);

  const storeData = toStoreData(store);
  const productData = products.map(toProductData);
  const categoryData: CategoryData[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  const url = absoluteUrl(storePath(store.slug));
  const image = store.coverUrl || store.logoUrl || undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    description: buildDescription(store),
    url,
    ...(image ? { image } : {}),
    ...(store.phone ? { telephone: store.phone } : {}),
    ...(store.address
      ? { address: { "@type": "PostalAddress", streetAddress: store.address } }
      : {}),
    ...(store.category ? { category: store.category } : {}),
    priceRange: "EGP",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <StorefrontView
        slug={store.slug}
        store={storeData}
        products={productData}
        categories={categoryData}
      />
    </>
  );
}

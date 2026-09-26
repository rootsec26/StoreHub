import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getCategoryName,
  getStoreBySlug,
  getStoreProduct,
} from "@/lib/storefront";
import { SITE_NAME, absoluteUrl, productPath, storePath } from "@/lib/site";
import { normalizeAccent } from "@/lib/theme";
import ProductView from "./product-view";

interface ProductPageProps {
  params: Promise<{ slug: string; id: string }>;
}

function buildDescription(product: {
  name: string;
  description: string | null;
}): string {
  if (product.description) return product.description.slice(0, 300);
  return `${product.name} — available now. Order online from our store on ${SITE_NAME}.`;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const store = await getStoreBySlug(slug);

  if (!store) {
    return {
      title: "Store Not Found",
      description: "The store you're looking for doesn't exist.",
      robots: { index: false, follow: false },
    };
  }

  const product = await getStoreProduct(store.id, id);

  if (!product) {
    return {
      title: "Product Not Found",
      description: "This product doesn't exist or is no longer available.",
      robots: { index: false, follow: false },
    };
  }

  const accent = normalizeAccent(store.accentColor);
  const description = buildDescription(product);
  const url = absoluteUrl(productPath(store.slug, product.id));
  const image =
    product.imageUrl || store.coverUrl || store.logoUrl || undefined;
  const title = `${product.name} · ${store.name}`;

  return {
    title,
    description,
    keywords: [product.name, store.name, store.category || ""].filter(Boolean),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    other: { "theme-color": accent },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug, id } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const product = await getStoreProduct(store.id, id);
  if (!product) notFound();

  const categoryName = await getCategoryName(product.categoryId);
  const url = absoluteUrl(productPath(store.slug, product.id));
  const inStock = (product.stock ?? 0) > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: buildDescription(product),
    sku: product.id,
    url,
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    ...(categoryName ? { category: categoryName } : {}),
    brand: { "@type": "Brand", name: store.name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "EGP",
      price: product.price,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: store.name },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ProductView
        slug={store.slug}
        store={{
          name: store.name,
          accentColor: store.accentColor ?? "",
        }}
        product={{
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          price: product.price,
          stock: product.stock ?? 0,
          imageUrl: product.imageUrl ?? "",
        }}
        categoryName={categoryName}
      />
    </>
  );
}

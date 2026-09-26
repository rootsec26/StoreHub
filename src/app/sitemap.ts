import type { MetadataRoute } from "next";

import { absoluteUrl, storePath, productPath } from "@/lib/site";
import { getSitemapProducts, getSitemapStores } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  try {
    const [storeList, productList] = await Promise.all([
      getSitemapStores(),
      getSitemapProducts(),
    ]);

    for (const store of storeList) {
      entries.push({
        url: absoluteUrl(storePath(store.slug)),
        lastModified: store.createdAt,
        changeFrequency: "daily",
        priority: 0.9,
      });
    }

    for (const product of productList) {
      entries.push({
        url: absoluteUrl(productPath(product.storeSlug, product.productId)),
        lastModified: undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch (error) {
    console.error("sitemap: failed to load storefront entries:", error);
  }

  return entries;
}

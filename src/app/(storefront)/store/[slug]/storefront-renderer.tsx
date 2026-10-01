"use client";

import StorefrontView, {
  type StoreData,
  type ProductData,
  type CategoryData,
} from "./storefront-view";
import { StorefrontClientShell } from "@/components/storefront/StorefrontClientShell";
import type { PromotionRecord } from "@/lib/promotions";

interface StorefrontRendererProps {
  storeId: string;
  store: StoreData;
  products: ProductData[];
  categories: CategoryData[];
  initialPromotions: PromotionRecord[];
}

export default function StorefrontRenderer({
  storeId,
  store,
  products,
  categories,
  initialPromotions,
}: StorefrontRendererProps) {
  return (
    <StorefrontClientShell storeId={storeId} initialProducts={products}>
      {({ products: realtimeProducts, wishlist, recentlyViewed, realtimeStatus }) => (
        <StorefrontView
          slug={store.slug}
          store={store}
          products={realtimeProducts}
          categories={categories}
          wishlist={wishlist}
          recentlyViewed={recentlyViewed}
          realtimeStatus={realtimeStatus}
          initialPromotions={initialPromotions}
        />
      )}
    </StorefrontClientShell>
  );
}

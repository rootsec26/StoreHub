"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ProductData } from "@/app/(storefront)/store/[slug]/storefront-view";

interface ProductRowRaw {
  id?: string | null;
  store_id?: string | null;
  name?: string | null;
  description?: string | null;
  price?: string | number | null;
  stock?: number | null;
  image_url?: string | null;
  category_id?: string | null;
  is_visible?: boolean | null;
  created_at?: string | null;
}

interface ProductRealtimeState {
  storeId: string | null;
  status: "idle" | "connecting" | "live" | "error";
  products: ProductData[];
  setProducts: (products: ProductData[]) => void;
  connect: (storeId: string, initialProducts: ProductData[]) => void;
  disconnect: () => void;
}

let activeProductChannel: RealtimeChannel | null = null;
let activeProductClient: SupabaseClient | null = null;
let activeProductStoreId: string | null = null;

function toProductData(row: ProductRowRaw): ProductData | null {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    price: String(row.price ?? "0"),
    stock: row.stock ?? 0,
    imageUrl: row.image_url ?? "",
    categoryId: row.category_id ?? null,
    isVisible: row.is_visible ?? true,
  };
}

function teardownProductConnection(): void {
  if (activeProductChannel && activeProductClient) {
    void activeProductClient.removeChannel(activeProductChannel);
  }
  activeProductChannel = null;
  activeProductClient = null;
  activeProductStoreId = null;
}

export const useProductRealtime = create<ProductRealtimeState>()((set, get) => ({
  storeId: null,
  status: "idle",
  products: [],

  setProducts: (products: ProductData[]) => set({ products }),

  connect: (storeId: string, initialProducts: ProductData[]) => {
    if (!storeId) return;
    if (activeProductStoreId === storeId) {
      set({ products: initialProducts });
      return;
    }

    teardownProductConnection();
    activeProductStoreId = storeId;
    set({ storeId, status: "connecting", products: initialProducts });

    const client = getSupabaseBrowserClient();
    const channel = client.channel(`products:${storeId}`);

    channel
      .on<ProductRowRaw>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          if (payload.errors && payload.errors.length > 0) return;

          const currentProducts = get().products;

          if (payload.eventType === "INSERT") {
            const newProduct = toProductData(payload.new);
            if (newProduct && newProduct.isVisible) {
              set({ products: [newProduct, ...currentProducts] });
            }
            return;
          }

          if (payload.eventType === "UPDATE") {
            const updatedProduct = toProductData(payload.new);
            if (!updatedProduct) return;
            set({
              products: currentProducts.map((p) =>
                p.id === updatedProduct.id ? updatedProduct : p
              ),
            });
            return;
          }

          if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (deletedId) {
              set({
                products: currentProducts.filter((p) => p.id !== deletedId),
              });
            }
            return;
          }
        }
      )
      .subscribe((status) => {
        if (activeProductStoreId !== storeId) return;

        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          set({ status: "live" });
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED
        ) {
          set({ status: "error" });
        }
      });

    activeProductClient = client;
    activeProductChannel = channel;
  },

  disconnect: () => {
    teardownProductConnection();
    set({
      storeId: null,
      status: "idle",
      products: [],
    });
  },
}));

interface WishlistState {
  items: string[];
  toggle: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (productId: string) => {
        const items = get().items;
        if (items.includes(productId)) {
          set({ items: items.filter((id) => id !== productId) });
        } else {
          set({ items: [...items, productId] });
        }
      },
      isInWishlist: (productId: string) => get().items.includes(productId),
      clear: () => set({ items: [] }),
    }),
    {
      name: "wishlist-storage",
    }
  )
);

interface RecentlyViewedState {
  items: ProductData[];
  add: (product: ProductData) => void;
  clear: () => void;
}

const MAX_RECENTLY_VIEWED = 20;

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product: ProductData) => {
        const items = get().items.filter((p) => p.id !== product.id);
        const newItems = [product, ...items].slice(0, MAX_RECENTLY_VIEWED);
        set({ items: newItems });
      },
      clear: () => set({ items: [] }),
    }),
    {
      name: "recently-viewed-storage",
    }
  )
);

export interface StorefrontClientShellProps {
  storeId: string;
  initialProducts: ProductData[];
  children: (props: {
    products: ProductData[];
    wishlist: {
      items: string[];
      toggle: (productId: string) => void;
      isInWishlist: (productId: string) => boolean;
    };
    recentlyViewed: {
      items: ProductData[];
      add: (product: ProductData) => void;
    };
    realtimeStatus: "idle" | "connecting" | "live" | "error";
  }) => React.ReactNode;
}

export function StorefrontClientShell({
  storeId,
  initialProducts,
  children,
}: StorefrontClientShellProps) {
  const { products, connect, disconnect, status } = useProductRealtime();
  const { items: wishlistItems, toggle: toggleWishlist, isInWishlist } =
    useWishlistStore();
  const { items: recentlyViewedItems, add: addRecentlyViewed } =
    useRecentlyViewedStore();

  useEffect(() => {
    connect(storeId, initialProducts);
    return () => disconnect();
  }, [storeId, initialProducts, connect, disconnect]);

  return (
    <StorefrontClientShellContext.Provider
      value={{
        wishlist: {
          items: wishlistItems,
          toggle: toggleWishlist,
          isInWishlist,
        },
        recentlyViewed: {
          items: recentlyViewedItems,
          add: addRecentlyViewed,
        },
      }}
    >
      {children({
        products,
        wishlist: {
          items: wishlistItems,
          toggle: toggleWishlist,
          isInWishlist,
        },
        recentlyViewed: {
          items: recentlyViewedItems,
          add: addRecentlyViewed,
        },
        realtimeStatus: status,
      })}
    </StorefrontClientShellContext.Provider>
  );
}

const StorefrontClientShellContext = createContext<{
  wishlist: {
    items: string[];
    toggle: (productId: string) => void;
    isInWishlist: (productId: string) => boolean;
  };
  recentlyViewed: {
    items: ProductData[];
    add: (product: ProductData) => void;
  };
} | null>(null);

export function useStorefrontClient() {
  const context = useContext(StorefrontClientShellContext);
  if (!context) {
    throw new Error(
      "useStorefrontClient must be used within a StorefrontClientShell"
    );
  }
  return context;
}
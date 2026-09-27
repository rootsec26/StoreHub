"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: string;
  name: string;
  price: string;
  quantity: number;
  imageUrl: string;
}

interface CartState {
  items: CartItem[];
  storeSlug: string | null;
  _hydrated: boolean;
  addItem: (item: CartItem, storeSlug: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      storeSlug: null,
      _hydrated: false,

      addItem: (item, storeSlug) => {
        const currentSlug = get().storeSlug;
        // If adding from a different store, clear the cart first
        if (currentSlug && currentSlug !== storeSlug) {
          set({ items: [item], storeSlug });
          return;
        }

        const existing = get().items.find(
          (i) => i.productId === item.productId
        );

        if (existing) {
          set({
            items: get().items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
            storeSlug,
          });
        } else {
          set({ items: [...get().items, item], storeSlug });
        }
      },

      removeItem: (productId) => {
        const newItems = get().items.filter(
          (i) => i.productId !== productId
        );
        set({
          items: newItems,
          storeSlug: newItems.length === 0 ? null : get().storeSlug,
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => set({ items: [], storeSlug: null }),

      getTotal: () => {
        return get().items.reduce(
          (total, item) => total + parseFloat(item.price) * item.quantity,
          0
        );
      },

      getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({
        items: state.items,
        storeSlug: state.storeSlug,
      }),
    }
  )
);

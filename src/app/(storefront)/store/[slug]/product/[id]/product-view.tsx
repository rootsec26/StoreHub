"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Store,
} from "lucide-react";

import { useCartStore, type CartItem } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { storePath } from "@/lib/site";

export interface ProductViewStore {
  name: string;
  accentColor: string;
}

export interface ProductViewProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
}

interface ProductViewProps {
  slug: string;
  store: ProductViewStore;
  product: ProductViewProduct;
  categoryName: string | null;
}

export default function ProductView({
  slug,
  store,
  product,
  categoryName,
}: ProductViewProps) {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const cart = useCartStore();

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const accent = normalizeAccent(store.accentColor);
  const inStock = product.stock > 0;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [added]);

  function handleAddToCart() {
    const item: CartItem = {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
    };
    cart.addItem(item, slug);
    setAdded(true);
  }

  return (
    <div style={accentThemeStyle(accent)}>
      <header
        className="relative overflow-hidden"
        style={{ backgroundImage: accentGradient(accent) }}
      >
        <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href={storePath(slug)}
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("product.backToStore")}
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-white/80" />
            <span className="truncate text-sm font-semibold text-white">
              {store.name}
            </span>
          </div>

          <button
            onClick={() => router.push(`/store/${slug}/checkout`)}
            className="relative inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25"
            aria-label={t("store.cartTitle", { count: cart.getItemCount() })}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.getItemCount() > 0 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {cart.getItemCount()}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {isValidImageUrl(product.imageUrl) ? (
              <Image
                src={product.imageUrl!}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized={!canOptimizeImage(product.imageUrl)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-20 w-20 text-slate-300" />
              </div>
            )}
            {!inStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-600">
                  {t("store.outOfStock")}
                </span>
              </div>
            )}
          </div>

          <div>
            {categoryName && (
              <span className="inline-flex items-center rounded-full bg-[var(--store-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--store-accent-dark)]">
                {categoryName}
              </span>
            )}

            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              {product.name}
            </h1>

            <p className="mt-3 text-3xl font-bold text-[var(--store-accent)]">
              {formatMoney(product.price)}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              {inStock
                ? t("products.inStock", { count: product.stock })
                : t("store.outOfStock")}
            </p>

            {product.description && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("product.description")}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {product.description}
                </p>
              </div>
            )}

            {inStock && (
              <div className="mt-8">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  {t("product.quantity")}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-1">
                    <button
                      onClick={() =>
                        setQuantity((current) => Math.max(1, current - 1))
                      }
                      disabled={quantity <= 1}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      aria-label="−"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {quantity}
                    </span>
                    <button
                      onClick={() =>
                        setQuantity((current) =>
                          Math.min(product.stock, current + 1)
                        )
                      }
                      disabled={quantity >= product.stock}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      aria-label="+"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--store-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {added ? (
                      <>
                        <Check className="h-4 w-4" />
                        {t("product.addedToCart")}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4" />
                        {t("store.addToCart")}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center sm:px-6">
          <div className="flex items-center justify-center gap-2">
            <Store className="h-4 w-4 text-[var(--store-accent)]" />
            <span className="text-sm font-medium text-slate-600">
              {t("store.poweredBy")}
            </span>
          </div>
          <Link
            href={storePath(slug)}
            className="text-sm font-medium text-[var(--store-accent)] hover:underline"
          >
            {t("product.backToStore")}
          </Link>
        </div>
      </footer>
    </div>
  );
}

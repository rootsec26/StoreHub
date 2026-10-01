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
import { convertAndFormatPrice } from "@/lib/currency";
import { useNow, useStorePromotions } from "@/lib/promotions-hooks";
import {
  bestPromotionFor,
  discountedPrice,
  type PromotionRecord,
} from "@/lib/promotions";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { storePath } from "@/lib/site";
import { useStoreCurrency } from "@/components/CurrencySelector";

export interface ProductViewStore {
  name: string;
  accentColor: string;
  currency: string;
  supportedCurrencies: string[];
}

export interface ProductViewProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryId: string | null;
}

interface ProductViewProps {
  slug: string;
  store: ProductViewStore;
  product: ProductViewProduct;
  categoryName: string | null;
  initialPromotions?: PromotionRecord[] | null;
}

export default function ProductView({
  slug,
  store,
  product,
  categoryName,
  initialPromotions,
}: ProductViewProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const cart = useCartStore();

  const { currency: selectedCurrency } = useStoreCurrency(
    store.currency,
    store.supportedCurrencies,
    locale
  );
  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const now = useNow();
  const promotions = useStorePromotions(slug, initialPromotions);
  const promotion = now === null ? null : bestPromotionFor(product, promotions, now);
  const basePrice = parseFloat(product.price);
  const salePrice = discountedPrice(basePrice, promotion);
  const onSale = promotion !== null && salePrice < basePrice;

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
      price: String(onSale ? salePrice : basePrice),
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

            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <p className="text-3xl font-bold text-[var(--color-primary)]">
                {convertAndFormatPrice(
                  onSale ? salePrice : basePrice,
                  store.currency,
                  selectedCurrency,
                  priceLocale
                )}
              </p>
              {onSale && (
                <p className="text-lg font-medium text-slate-400 line-through">
                  {convertAndFormatPrice(
                    basePrice,
                    store.currency,
                    selectedCurrency,
                    priceLocale
                  )}
                </p>
              )}
              {onSale && promotion && (
                <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
                  {t("store.flash.off", {
                    percent: promotion.discountPercentage,
                  })}
                </span>
              )}
            </div>

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
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
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
            <Store className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="text-sm font-medium text-slate-600">
              {t("store.poweredBy")}
            </span>
          </div>
          <Link
            href={storePath(slug)}
            className="text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            {t("product.backToStore")}
          </Link>
        </div>
      </footer>
    </div>
  );
}

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
import StoreFooter from "@/components/storefront/Footer";
import {
  comparePriceFor,
  effectiveProductPrice,
  productDiscountPercent,
  productImageUrls,
  toAvailability,
  type ProductAvailability,
  type ProductSpecification,
} from "@/lib/product-details";

export interface ProductViewStore {
  name: string;
  accentColor: string;
  currency: string;
  supportedCurrencies: string[];
  /** White-label add-on: hides the "Powered by StoreHub" credit. */
  hasWhiteLabel?: boolean;
}

export interface ProductViewProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryId: string | null;
  sku?: string;
  compareAtPrice?: string | null;
  salePrice?: string | null;
  discountPercent?: number | null;
  availability?: ProductAvailability | string;
  imageGallery?: string[];
  specifications?: ProductSpecification[];
  tags?: string[];
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
  const [selectedImage, setSelectedImage] = useState(0);

  const now = useNow();
  const promotions = useStorePromotions(slug, initialPromotions);
  const promotion = now === null ? null : bestPromotionFor(product, promotions, now);
  const basePrice = effectiveProductPrice(product);
  const salePrice = discountedPrice(basePrice, promotion);
  const comparePrice = comparePriceFor(product);
  const productDiscount = productDiscountPercent(product);
  const onSale =
    (promotion !== null && salePrice < basePrice) ||
    (comparePrice !== null && basePrice < comparePrice);
  const images = productImageUrls(product);
  const activeImage = images[selectedImage] ?? images[0] ?? "";
  const availability = toAvailability(product.availability);
  const purchasable = availability === "IN_STOCK" && product.stock > 0;

  const accent = normalizeAccent(store.accentColor);
  const inStock = purchasable;

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
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              {isValidImageUrl(activeImage) ? (
                <Image
                  src={activeImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                  loading="eager"
                  unoptimized={!canOptimizeImage(activeImage)}
                  className="h-full w-full object-cover transition-transform duration-500"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="h-20 w-20 text-slate-300" />
                </div>
              )}
              {!purchasable && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-600">
                    {availability === "COMING_SOON"
                      ? t("product.comingSoon")
                      : t("store.outOfStock")}
                  </span>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setSelectedImage(index)}
                    className={`relative aspect-square overflow-hidden rounded-xl border bg-slate-100 transition ${
                      index === selectedImage
                        ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    aria-label={`${product.name} ${index + 1}`}
                  >
                    {isValidImageUrl(image) ? (
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes="80px"
                        unoptimized={!canOptimizeImage(image)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <Package className="h-5 w-5 text-slate-300" />
                      </span>
                    )}
                  </button>
                ))}
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
              {onSale && comparePrice !== null && (
                <p className="text-lg font-medium text-slate-400 line-through">
                  {convertAndFormatPrice(
                    comparePrice,
                    store.currency,
                    selectedCurrency,
                    priceLocale
                  )}
                </p>
              )}
              {onSale && (promotion?.discountPercentage ?? productDiscount) !== null && (
                <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
                  {t("store.flash.off", {
                    percent: promotion?.discountPercentage ?? productDiscount ?? 0,
                  })}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                {availability === "IN_STOCK"
                  ? t("products.inStock", { count: product.stock })
                  : availability === "COMING_SOON"
                    ? t("product.comingSoon")
                    : t("store.outOfStock")}
              </span>
              {product.sku && (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-500">
                  {t("product.sku")}: {product.sku}
                </span>
              )}
            </div>

            {(product.tags?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {product.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--store-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--store-accent-dark)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

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

            {(product.specifications?.length ?? 0) > 0 && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("product.specifications")}
                </h2>
                <dl className="mt-3 divide-y divide-slate-100">
                  {product.specifications?.map((spec, index) => (
                    <div
                      key={`${spec.label}-${spec.value}-${index}`}
                      className="flex items-start justify-between gap-4 py-2.5 text-sm"
                    >
                      <dt className="shrink-0 font-medium text-slate-500">
                        {spec.label || t("product.details")}
                      </dt>
                      <dd className="text-end font-semibold text-slate-900">
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
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

      <StoreFooter
        hasWhiteLabel={store.hasWhiteLabel}
        containerClassName="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center sm:px-6"
      >
        <Link
          href={storePath(slug)}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {t("product.backToStore")}
        </Link>
      </StoreFooter>
    </div>
  );
}

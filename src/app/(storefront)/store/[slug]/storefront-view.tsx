"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Store,
  ShoppingCart,
  Plus,
  Minus,
  Package,
  Tag,
  Search,
  X,
  Languages,
} from "lucide-react";

import { useCartStore, type CartItem } from "@/lib/cart";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { canOptimizeImage } from "@/lib/images";
import { productPath } from "@/lib/site";

export interface StoreData {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  logoUrl: string;
  coverUrl: string;
  phone: string;
  address: string;
  accentColor: string;
}

export interface ProductData {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryId: string | null;
  isVisible: boolean;
}

export interface CategoryData {
  id: string;
  name: string;
}

interface StorefrontViewProps {
  slug: string;
  store: StoreData;
  products: ProductData[];
  categories: CategoryData[];
}

const KNOWN_CATEGORIES = [
  "Fashion",
  "Electronics",
  "Food & Drinks",
  "Home & Garden",
  "Beauty",
  "Sports",
  "Books",
  "Other",
];

export default function StorefrontView({
  slug,
  store,
  products,
  categories,
}: StorefrontViewProps) {
  const router = useRouter();

  const { t, locale, toggleLocale, formatMoney } = useI18n();

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCart, setShowCart] = useState(false);

  const cart = useCartStore();

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "all" || p.categoryId === selectedCategory;
    const matchesSearch = p.name
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  function addToCart(product: ProductData) {
    const item: CartItem = {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.imageUrl,
    };
    cart.addItem(item, slug);
  }

  const accent = normalizeAccent(store.accentColor);

  const categoryLabel = KNOWN_CATEGORIES.includes(store.category)
    ? t(`category.${store.category}` as TranslationKey)
    : store.category;

  return (
    <div style={accentThemeStyle(accent)}>
      {/* Store Header */}
      <header
        className="relative overflow-hidden"
        style={{ backgroundImage: accentGradient(accent) }}
      >
        {store.coverUrl && (
          <Image
            src={store.coverUrl}
            alt=""
            fill
            sizes="100vw"
            unoptimized={!canOptimizeImage(store.coverUrl)}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        )}
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex items-start gap-4">
            {store.logoUrl ? (
              <Image
                src={store.logoUrl}
                alt={store.name}
                width={64}
                height={64}
                unoptimized={!canOptimizeImage(store.logoUrl)}
                className="h-16 w-16 rounded-xl border-2 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/20">
                <Store className="h-8 w-8 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {store.name}
              </h1>
              {store.description && (
                <p className="mt-1 text-sm text-white/80 sm:text-base">
                  {store.description}
                </p>
              )}
              {store.category && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
                  <Tag className="h-3 w-3" />
                  {categoryLabel}
                </span>
              )}
            </div>
          </div>
          {store.phone && (
            <p className="mt-3 text-sm text-white/80" dir="ltr">
              📞 {store.phone}
              {store.address && ` · 📍 ${store.address}`}
            </p>
          )}
        </div>
      </header>

      {/* Filters & Search */}
      <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("store.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2 ps-10 pe-4 text-sm focus:border-[var(--store-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--store-accent)]"
            />
          </div>

          <button
            onClick={toggleLocale}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            title={t("store.language")}
            aria-label={t("store.language")}
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">
              {locale === "ar" ? "English" : "العربية"}
            </span>
          </button>

          <button
            onClick={() => setShowCart(!showCart)}
            className="relative inline-flex items-center gap-2 rounded-lg bg-[var(--store-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            aria-label={t("store.cartTitle", { count: cart.getItemCount() })}
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.getItemCount() > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {cart.getItemCount()}
              </span>
            )}
          </button>
        </div>
        {categories.length > 0 && (
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedCategory === "all"
                  ? "bg-[var(--store-accent)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t("store.all")}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-[var(--store-accent)] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">
              {t("store.noProducts")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const inCart = cart.items.find(
                (i) => i.productId === product.id
              );
              const href = productPath(slug, product.id);
              return (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <Link
                    href={href}
                    className="relative block h-48 bg-slate-100"
                    aria-label={product.name}
                  >
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        unoptimized={!canOptimizeImage(product.imageUrl)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Package className="h-12 w-12 text-slate-300" />
                      </span>
                    )}
                    {product.stock <= 0 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded-lg bg-white px-3 py-1 text-sm font-medium text-red-600">
                          {t("store.outOfStock")}
                        </span>
                      </span>
                    )}
                  </Link>
                  <div className="p-4">
                    <h3 className="font-medium text-slate-900">
                      <Link
                        href={href}
                        className="hover:text-[var(--store-accent)]"
                      >
                        {product.name}
                      </Link>
                    </h3>
                    {product.description && (
                      <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold text-[var(--store-accent)]">
                        {formatMoney(product.price)}
                      </span>
                      {product.stock > 0 && (
                        <span className="text-xs text-slate-500">
                          {t("store.left", { count: product.stock })}
                        </span>
                      )}
                    </div>
                    {product.stock > 0 && (
                      <div className="mt-3">
                        {inCart ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (inCart.quantity <= 1) {
                                  cart.removeItem(product.id);
                                } else {
                                  cart.updateQuantity(
                                    product.id,
                                    inCart.quantity - 1
                                  );
                                }
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                              aria-label="−"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">
                              {inCart.quantity}
                            </span>
                            <button
                              onClick={() =>
                                cart.updateQuantity(
                                  product.id,
                                  inCart.quantity + 1
                                )
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                              aria-label="+"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--store-accent)] py-2 text-sm font-medium text-white hover:opacity-90"
                          >
                            <Plus className="h-4 w-4" />
                            {t("store.addToCart")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Drawer */}
      {showCart && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowCart(false)}
          />
          <div className="fixed inset-y-0 end-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("store.cartTitle", { count: cart.getItemCount() })}
              </h2>
              <button
                onClick={() => setShowCart(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cart.items.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <p className="text-slate-600">{t("store.cartEmpty")}</p>
              </div>
            ) : (
              <>
                <div className="divide-y px-4">
                  {cart.items.map((item) => (
                    <div key={item.productId} className="flex gap-3 py-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            width={64}
                            height={64}
                            unoptimized={!canOptimizeImage(item.imageUrl)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-6 w-6 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-slate-900">
                          {item.name}
                        </h4>
                        <p className="text-sm text-[var(--store-accent)]">
                          {formatMoney(item.price)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (item.quantity <= 1) {
                                cart.removeItem(item.productId);
                              } else {
                                cart.updateQuantity(
                                  item.productId,
                                  item.quantity - 1
                                );
                              }
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-xs"
                          >
                            −
                          </button>
                          <span className="text-sm">{item.quantity}</span>
                          <button
                            onClick={() =>
                              cart.updateQuantity(
                                item.productId,
                                item.quantity + 1
                              )
                            }
                            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatMoney(parseFloat(item.price) * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t px-4 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-slate-900">
                      {t("store.total")}
                    </span>
                    <span className="text-xl font-bold text-[var(--store-accent)]">
                      {formatMoney(cart.getTotal())}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowCart(false);
                      router.push(`/store/${slug}/checkout`);
                    }}
                    className="mt-4 w-full rounded-lg bg-[var(--store-accent)] py-2.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {t("store.checkout")}
                  </button>
                  <button
                    onClick={() => cart.clearCart()}
                    className="mt-2 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {t("store.clearCart")}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Floating Cart Button (mobile) */}
      {cart.getItemCount() > 0 && !showCart && (
        <div className="fixed bottom-4 end-4 z-30 sm:bottom-6 sm:end-6">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--store-accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
          >
            <ShoppingCart className="h-5 w-5" />
            {formatMoney(cart.getTotal())}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {cart.getItemCount()}
            </span>
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <div className="flex items-center justify-center gap-2">
            <Store className="h-4 w-4 text-[var(--store-accent)]" />
            <span className="text-sm font-medium text-slate-600">
              {t("store.poweredBy")}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

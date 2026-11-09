"use client";

import { useState, useEffect } from "react";
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
  Phone,
  MapPin,
  Zap,
  PackageSearch,
} from "lucide-react";

import { useCartStore, type CartItem } from "@/lib/cart";
import { accentGradient, accentThemeStyle, normalizeAccent } from "@/lib/theme";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import { productPath } from "@/lib/site";
import { convertAndFormatPrice } from "@/lib/currency";
import CurrencySelector, { useStoreCurrency } from "@/components/CurrencySelector";
import AIShoppingAssistant from "@/components/storefront/AIShoppingAssistant";
import FlashSaleBanner from "@/components/storefront/FlashSaleBanner";
import StoreFooter from "@/components/storefront/Footer";
import { useNow, useStorePromotions } from "@/lib/promotions-hooks";
import {
  bestPromotionFor,
  discountedPrice,
  type PromotionRecord,
} from "@/lib/promotions";
import { type ThemeConfig } from "@/lib/theme-config";
import {
  comparePriceFor,
  effectiveProductPrice,
  productDiscountPercent,
  type ProductAvailability,
  type ProductSpecification,
} from "@/lib/product-details";
import { Heart, HeartOff, History, Eye, Loader2, Bell } from "lucide-react";

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
  currency: string;
  supportedCurrencies: string[];
  /** White-label add-on: hides the "Powered by StoreHub" credit. */
  hasWhiteLabel: boolean;
  themeConfig: ThemeConfig;
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
  sku?: string;
  compareAtPrice?: string | null;
  salePrice?: string | null;
  discountPercent?: number | null;
  availability?: ProductAvailability;
  imageGallery?: string[];
  specifications?: ProductSpecification[];
  tags?: string[];
}

export interface CategoryData {
  id: string;
  name: string;
}

export interface WishlistActions {
  items: string[];
  toggle: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
}

export interface RecentlyViewedActions {
  items: ProductData[];
  add: (product: ProductData) => void;
}

interface StoreNotification {
  id: string;
  notificationId: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  status: string;
  sentAt: string;
  createdAt: string;
  readAt: string | null;
}

interface StorefrontViewProps {
  slug: string;
  store: StoreData;
  products: ProductData[];
  categories: CategoryData[];
  wishlist: WishlistActions;
  recentlyViewed: RecentlyViewedActions;
  realtimeStatus: "idle" | "connecting" | "live" | "error";
  initialPromotions?: PromotionRecord[] | null;
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
  wishlist,
  recentlyViewed,
  realtimeStatus,
  initialPromotions,
}: StorefrontViewProps) {
  const router = useRouter();

  const { t, locale, toggleLocale, formatMoney } = useI18n();
  const { currency: selectedCurrency } = useStoreCurrency(
    store.currency,
    store.supportedCurrencies,
    locale
  );

  const priceLocale = locale === "ar" ? "ar-EG" : "en-US";

  const now = useNow();
  const promotions = useStorePromotions(slug, initialPromotions);

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [showRecentlyViewed, setShowRecentlyViewed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifPhone, setNotifPhone] = useState("");
  const [notifPhoneInput, setNotifPhoneInput] = useState("");
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [notifLoaded, setNotifLoaded] = useState(false);

  const cart = useCartStore();
  const isHydrated = useCartStore((state) => state._hydrated ?? false);

  useEffect(() => {
    useCartStore.setState({ _hydrated: true });
  }, []);

  const notifStorageKey = `store-notifications-phone:${slug}`;

  // Restore the phone the shopper used previously on this device.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(notifStorageKey);
      if (saved) setNotifPhone(saved);
    } catch {}
  }, [notifStorageKey]);

  async function fetchNotifications(phone: string, markRead = false) {
    setNotifLoading(true);
    setNotifError("");
    try {
      const res = await fetch(
        `/api/storefront/notifications?slug=${encodeURIComponent(slug)}&phone=${encodeURIComponent(phone)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("store.notificationsError"));
      }
      const items = (data.items ?? []) as StoreNotification[];
      setNotifications(items);
      setNotifLoaded(true);

      const unread = Number(data.unreadCount ?? 0);
      if (markRead && unread > 0) {
        // Opening the inbox counts as reading — clear the badge server-side.
        const ids = items.filter((item) => !item.readAt).map((item) => item.id);
        fetch("/api/storefront/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, phone, ids }),
        }).catch(() => {});
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))
        );
        setNotifUnread(0);
      } else {
        setNotifUnread(unread);
      }
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : t("store.notificationsError"));
    } finally {
      setNotifLoading(false);
    }
  }

  function openNotifications() {
    setShowNotifications(!showNotifications);
  }

  function handleNotifPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phone = notifPhoneInput.trim();
    if (!phone) return;
    setNotifPhone(phone);
    setNotifPhoneInput("");
    setNotifLoaded(false);
    setNotifications([]);
    try {
      window.localStorage.setItem(notifStorageKey, phone);
    } catch {}
  }

  // Load the inbox whenever the shopper's phone or the drawer state changes.
  // Opening the drawer marks everything read; a closed drawer only refreshes
  // the unread badge count.
  useEffect(() => {
    if (notifPhone) {
      fetchNotifications(notifPhone, showNotifications);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPhone, showNotifications]);

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "all" || p.categoryId === selectedCategory;
    const matchesSearch = p.name
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  /** Current pricing for a product: merchant sale price first, then flash promotions. */
  function salePriceOf(product: ProductData) {
    const promotion =
      now === null ? null : bestPromotionFor(product, promotions, now);
    const base = effectiveProductPrice(product);
    const price = discountedPrice(base, promotion);
    const compare = comparePriceFor(product);
    const productDiscount = productDiscountPercent(product);
    const onSale =
      (promotion !== null && price < base) ||
      (compare !== null && base < compare);
    return {
      promotion,
      base,
      price,
      compare,
      productDiscount,
      onSale,
    };
  }

  function addToCart(product: ProductData) {
    const item: CartItem = {
      productId: product.id,
      name: product.name,
      price: String(salePriceOf(product).price),
      quantity: 1,
      imageUrl: product.imageUrl,
    };
    cart.addItem(item, slug);
  }

  function handleProductClick(product: ProductData) {
    recentlyViewed.add(product);
  }

  const categoryLabel = KNOWN_CATEGORIES.includes(store.category)
    ? t(`category.${store.category}` as TranslationKey)
    : store.category;

  const accent = normalizeAccent(store.accentColor);

  const wishlistProducts = products.filter((p) =>
    wishlist.items.includes(p.id)
  );

  const categoryCounts = categories.reduce<Record<string, number>>(
    (counts, category) => {
      counts[category.id] = products.filter(
        (product) => product.categoryId === category.id
      ).length;
      return counts;
    },
    {}
  );

  return (
    <div className="w-full overflow-x-clip" style={accentThemeStyle(accent)}>
      {/* Flash sale countdown banner (sticky) */}
      <FlashSaleBanner slug={slug} initialPromotions={initialPromotions} />

      {/* Store Header */}
      <header
        className="relative overflow-hidden border-b border-white/10"
        style={{ backgroundImage: accentGradient(accent) }}
      >
        {isValidImageUrl(store.coverUrl) && (
          <Image
            src={store.coverUrl!}
            alt=""
            fill
            sizes="100vw"
            unoptimized={!canOptimizeImage(store.coverUrl)}
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />
        )}
        <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 end-0 h-80 w-80 rounded-full bg-black/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.14),transparent_32%)]" />

        <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
            <div
              className="animate-storefront-pop shrink-0 self-center sm:self-auto"
              style={{ animationDelay: "60ms" }}
            >
              {isValidImageUrl(store.logoUrl) ? (
                <Image
                  src={store.logoUrl!}
                  alt={store.name}
                  width={160}
                  height={160}
                  unoptimized={!canOptimizeImage(store.logoUrl)}
                  className="h-28 w-28 rounded-[2rem] border-4 border-white/40 object-cover shadow-2xl shadow-black/25 ring-2 ring-white/30 sm:h-36 sm:w-36"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border-4 border-white/40 bg-white/15 shadow-2xl shadow-black/25 ring-2 ring-white/30 backdrop-blur sm:h-36 sm:w-36">
                  <Store className="h-14 w-14 text-white" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-start">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {store.category && (
                  <span className="inline-flex animate-storefront-fade-up items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur">
                    <Tag className="h-3.5 w-3.5" />
                    {categoryLabel}
                  </span>
                )}
                {store.address && (
                  <span className="inline-flex animate-storefront-fade-up items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur" style={{ animationDelay: "90ms" }}>
                    <MapPin className="h-3.5 w-3.5" />
                    {store.address}
                  </span>
                )}
                {store.phone && (
                  <a
                    href={`tel:${store.phone}`}
                    className="inline-flex animate-storefront-fade-up items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
                    style={{ animationDelay: "120ms" }}
                    dir="ltr"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {store.phone}
                  </a>
                )}
              </div>

              <h1
                className="animate-storefront-fade-up text-3xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-4xl"
                style={{ animationDelay: "150ms" }}
              >
                {store.name}
              </h1>
              {store.description && (
                <p
                  className="animate-storefront-fade-up mx-auto mt-2 max-w-2xl text-sm leading-6 text-white/85 sm:mx-0 sm:text-base"
                  style={{ animationDelay: "210ms" }}
                >
                  {store.description}
                </p>
              )}

              <div
                className="animate-storefront-fade-up mt-5 flex flex-wrap items-center justify-center gap-2 sm:justify-start"
                style={{ animationDelay: "270ms" }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                  <Package className="h-3.5 w-3.5" />
                  {products.length} products
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                  <Tag className="h-3.5 w-3.5" />
                  {categories.length} categories
                </span>
                <Link
                  href={`/store/${slug}/track-order`}
                  className="inline-flex animate-storefront-fade-up items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/30"
                  style={{ animationDelay: "300ms" }}
                >
                  <PackageSearch className="h-3.5 w-3.5" />
                  {t("store.trackOrder")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filters & Search */}
      <div
        className="sticky z-30 border-b bg-white/80 backdrop-blur-sm"
        style={{ top: "var(--flash-banner-h, 0px)" }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:flex-nowrap sm:gap-3 sm:px-6">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("store.searchPlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-10 pe-10 text-sm shadow-sm transition focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <CurrencySelector
            storeCurrency={store.currency}
            storeSupportedCurrencies={store.supportedCurrencies}
          />

          <button
            onClick={toggleLocale}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            title={t("store.language")}
            aria-label={t("store.language")}
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">
              {locale === "ar" ? "AR · العربية" : "EN · English"}
            </span>
          </button>

          <button
            onClick={openNotifications}
            className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label={t("store.notifications")}
          >
            <Bell className="h-4 w-4" />
            {notifUnread > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs text-white">
                {notifUnread > 9 ? "9+" : notifUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowWishlist(!showWishlist)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label={t("store.wishlistTitle", { count: wishlist.items.length })}
          >
            <Heart className="h-4 w-4" />
            {wishlist.items.length > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {wishlist.items.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowRecentlyViewed(!showRecentlyViewed)}
            className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label={t("store.recentlyViewedTitle", { count: recentlyViewed.items.length })}
          >
            <History className="h-4 w-4" />
            {recentlyViewed.items.length > 0 && (
              <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                {recentlyViewed.items.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowCart(!showCart)}
            className="relative inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            aria-label={t("store.cartTitle", { count: isHydrated ? cart.getItemCount() : 0 })}
          >
            <ShoppingCart className="h-4 w-4" />
            {isHydrated && cart.getItemCount() > 0 && (
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
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition-all duration-300 ${
                selectedCategory === "all"
                  ? "scale-105 bg-[var(--color-primary)] text-white shadow-md"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {t("store.all")}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedCategory === "all" ? "bg-white/20" : "bg-slate-100"}`}>
                {products.length}
              </span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm transition-all duration-300 ${
                  selectedCategory === cat.id
                    ? "scale-105 bg-[var(--color-primary)] text-white shadow-md"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Tag className="h-3.5 w-3.5 opacity-70" />
                {cat.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedCategory === cat.id ? "bg-white/20" : "bg-slate-100"}`}>
                  {categoryCounts[cat.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {filteredProducts.length === 0 ? (
          <div className="animate-storefront-fade-up py-20 text-center">
            <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">
              {t("store.noProducts")}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">
                {filteredProducts.length} products
              </p>
              {(search || selectedCategory !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory("all");
                  }}
                  className="text-sm font-semibold text-[var(--color-primary)] transition hover:opacity-80"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((product, productIndex) => {
              const inCart = isHydrated
                ? cart.items.find((i) => i.productId === product.id)
                : undefined;
              const isInWishlist = wishlist.isInWishlist(product.id);
              const href = productPath(slug, product.id);
              const { promotion, base, price, compare, productDiscount, onSale } =
                salePriceOf(product);
              const availability = product.availability ?? "IN_STOCK";
              const purchasable = availability === "IN_STOCK" && product.stock > 0;
              return (
                <article
                  key={product.id}
                  className="storefront-card-hover animate-storefront-fade-up group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"
                  style={{ animationDelay: `${Math.min(productIndex * 45, 360)}ms` }}
                >
                  <Link
                    href={href}
                    className="relative block h-44 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 sm:h-48"
                    aria-label={product.name}
                    onClick={() => handleProductClick(product)}
                  >
                    {isValidImageUrl(product.imageUrl) ? (
                      <Image
                        src={product.imageUrl!}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 20vw"
                        unoptimized={!canOptimizeImage(product.imageUrl)}
                        className="storefront-card-image h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Package className="h-10 w-10 text-slate-300 transition-transform duration-500 group-hover:scale-110" />
                      </span>
                    )}

                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
                      <div className="flex flex-col items-start gap-1.5">
                        {onSale && (promotion?.discountPercentage ?? productDiscount) !== null && (
                          <span className="inline-flex animate-storefront-pop items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-rose-600/30">
                            <Zap className="h-3 w-3" />
                            {t("store.flash.off", {
                              percent: promotion?.discountPercentage ?? productDiscount ?? 0,
                            })}
                          </span>
                        )}
                        {product.stock > 0 && product.stock <= 5 && (
                          <span className="rounded-full bg-amber-500/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur">
                            {t("store.left", { count: product.stock })}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          wishlist.toggle(product.id);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md backdrop-blur transition-all duration-300 hover:scale-110 hover:bg-white"
                        aria-label={isInWishlist ? t("store.removeFromWishlist") : t("store.addToWishlist")}
                        aria-pressed={isInWishlist}
                      >
                        {isInWishlist ? (
                          <Heart className="h-4 w-4 text-rose-500 fill-current" />
                        ) : (
                          <HeartOff className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {!purchasable && (
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px]">
                        <span className="animate-storefront-pop rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-600 shadow-xl">
                          {availability === "COMING_SOON"
                            ? t("product.comingSoon")
                            : t("store.outOfStock")}
                        </span>
                      </span>
                    )}

                  </Link>

                  <div className="flex flex-1 flex-col p-3 sm:p-4">
                    <h3 className="line-clamp-1 font-bold text-slate-900 transition-colors group-hover:text-[var(--color-primary)]">
                      <Link href={href}>{product.name}</Link>
                    </h3>
                    {product.description && (
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-lg font-extrabold text-[var(--color-primary)]">
                          {convertAndFormatPrice(
                            onSale ? price : base,
                            store.currency,
                            selectedCurrency,
                            priceLocale
                          )}
                        </span>
                        {onSale && compare !== null && (
                          <span className="text-xs font-semibold text-slate-400 line-through">
                            {convertAndFormatPrice(
                              compare,
                              store.currency,
                              selectedCurrency,
                              priceLocale
                            )}
                          </span>
                        )}
                      </div>
                      {product.stock > 5 && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600">
                          {t("store.left", { count: product.stock })}
                        </span>
                      )}
                    </div>

                    {purchasable && (
                      <div className="mt-3 space-y-2">
                        {inCart ? (
                          <div className="flex items-center justify-between rounded-xl bg-slate-100 p-1.5">
                            <button
                              type="button"
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
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                              aria-label="−"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-bold text-slate-900">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                cart.updateQuantity(
                                  product.id,
                                  inCart.quantity + 1
                                )
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                              aria-label="+"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => addToCart(product)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:brightness-110 active:scale-95"
                              style={{ backgroundImage: accentGradient(accent) }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              {t("store.addToCart")}
                            </button>
                            <Link
                              href={href}
                              onClick={() => handleProductClick(product)}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t("product.viewDetails")}
                            </Link>
                          </div>
                        )}
                        {inCart && (
                          <Link
                            href={href}
                            onClick={() => handleProductClick(product)}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t("product.viewDetails")}
                          </Link>
                        )}
                      </div>
                    )}

                    {!purchasable && (
                      <Link
                        href={href}
                        onClick={() => handleProductClick(product)}
                        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("product.viewDetails")}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
            </div>
          </>
        )}
      </main>

      {/* Cart Drawer */}
      {showCart && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowCart(false)}
          />
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-md overflow-y-auto shadow-xl"
            style={{ backgroundColor: "var(--color-background)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-4"
              style={{ borderColor: "var(--color-primary-soft)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {t("store.cartTitle", { count: isHydrated ? cart.getItemCount() : 0 })}
              </h2>
              <button
                onClick={() => setShowCart(false)}
                style={{ color: "var(--color-text-muted)" }}
                className="hover:opacity-70"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isHydrated ? (
              <div className="py-16 text-center">
                <ShoppingCart
                  className="mx-auto mb-4 h-12 w-12 animate-pulse"
                  style={{ color: "var(--color-text-muted)" }}
                />
              </div>
            ) : cart.items.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingCart
                  className="mx-auto mb-4 h-12 w-12"
                  style={{ color: "var(--color-text-muted)" }}
                />
                <p style={{ color: "var(--color-text)" }}>{t("store.cartEmpty")}</p>
              </div>
            ) : (
              <>
                <div className="divide-y px-4">
                  {cart.items.map((item) => (
                    <div key={item.productId} className="flex gap-3 py-4">
                      <div
                        className="h-16 w-16 shrink-0 overflow-hidden"
                        style={{
                          backgroundColor: "var(--color-primary-soft)",
                          borderRadius: "var(--radius)",
                        }}
                      >
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
                            <Package className="h-6 w-6" style={{ color: "var(--color-text-muted)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {item.name}
                        </h4>
                        <p className="text-sm" style={{ color: "var(--color-primary)" }}>
                          {convertAndFormatPrice(parseFloat(item.price), store.currency, selectedCurrency, priceLocale)}
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
                            className="theme-btn-secondary flex h-6 w-6 items-center justify-center text-xs"
                            aria-label="−"
                          >
                            −
                          </button>
                          <span className="text-sm" style={{ color: "var(--color-text)" }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              cart.updateQuantity(
                                item.productId,
                                item.quantity + 1
                              )
                            }
                            className="theme-btn-secondary flex h-6 w-6 items-center justify-center text-xs"
                            aria-label="+"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {convertAndFormatPrice(parseFloat(item.price) * item.quantity, store.currency, selectedCurrency, priceLocale)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t px-4 py-4" style={{ borderColor: "var(--color-primary-soft)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                      {t("store.total")}
                    </span>
                    <span className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
                      {convertAndFormatPrice(cart.getTotal(), store.currency, selectedCurrency, priceLocale)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowCart(false);
                      router.push(`/store/${slug}/checkout`);
                    }}
                    className="theme-btn-primary mt-4 w-full py-2.5 text-sm font-semibold"
                  >
                    {t("store.checkout")}
                  </button>
                  <button
                    onClick={() => cart.clearCart()}
                    className="theme-btn-secondary mt-2 w-full py-2 text-sm font-medium"
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
      {isHydrated && cart.getItemCount() > 0 && !showCart && (
        <div className="fixed bottom-4 end-4 z-30 sm:bottom-6 sm:end-6">
          <button
            onClick={() => setShowCart(true)}
            className="theme-btn-primary flex items-center gap-2 px-6 py-3 text-sm font-semibold shadow-lg"
            style={{ borderRadius: "9999px" }}
          >
            <ShoppingCart className="h-5 w-5" />
            {convertAndFormatPrice(cart.getTotal(), store.currency, selectedCurrency, priceLocale)}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {cart.getItemCount()}
            </span>
          </button>
        </div>
      )}

      {/* Notifications / Customer Inbox Drawer */}
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowNotifications(false)}
          />
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-md overflow-y-auto shadow-xl"
            style={{ backgroundColor: "var(--color-background)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-4"
              style={{ borderColor: "var(--color-primary-soft)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {t("store.notificationsTitle")}
              </h2>
              <button
                onClick={() => setShowNotifications(false)}
                style={{ color: "var(--color-text-muted)" }}
                className="hover:opacity-70"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!notifPhone ? (
              <form onSubmit={handleNotifPhoneSubmit} className="space-y-4 px-4 py-8">
                <div className="text-center">
                  <Bell className="mx-auto mb-4 h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
                  <p className="text-sm" style={{ color: "var(--color-text)" }}>
                    {t("store.notificationsPhoneHint")}
                  </p>
                </div>
                {notifError && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{notifError}</div>
                )}
                <input
                  type="tel"
                  value={notifPhoneInput}
                  onChange={(e) => setNotifPhoneInput(e.target.value)}
                  placeholder={t("store.notificationsPhonePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={!notifPhoneInput.trim() || notifLoading}
                  className="theme-btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {notifLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("store.notificationsView")}
                </button>
              </form>
            ) : notifLoading && !notifLoaded ? (
              <div className="flex items-center justify-center gap-2 py-16">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-muted)" }} />
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {t("common.loading")}
                </span>
              </div>
            ) : notifError ? (
              <div className="px-4 py-16 text-center">
                <p className="text-sm text-red-600">{notifError}</p>
                <button
                  onClick={() => fetchNotifications(notifPhone, true)}
                  className="theme-btn-secondary mt-4 px-4 py-2 text-sm font-medium"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="mx-auto mb-4 h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
                <p className="px-6 text-sm" style={{ color: "var(--color-text)" }}>
                  {t("store.notificationsEmpty")}
                </p>
              </div>
            ) : (
              <div className="divide-y px-4" style={{ borderColor: "var(--color-primary-soft)" }}>
                {notifications.map((item) => (
                  <div key={item.id} className="flex gap-3 py-4">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        item.readAt ? "bg-slate-200" : "bg-amber-500"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {item.title}
                        </h4>
                        <span className="shrink-0 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {new Date(item.sentAt).toLocaleDateString(locale, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--color-text-muted)" }}>
                        {item.body}
                      </p>
                      {item.category && item.category !== "GENERAL" && (
                        <span className="mt-2 inline-block rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                          {item.category.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Wishlist Drawer */}
      {showWishlist && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowWishlist(false)}
          />
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-md overflow-y-auto shadow-xl"
            style={{ backgroundColor: "var(--color-background)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-4"
              style={{ borderColor: "var(--color-primary-soft)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {t("store.wishlistTitle", { count: wishlist.items.length })}
              </h2>
              <button
                onClick={() => setShowWishlist(false)}
                style={{ color: "var(--color-text-muted)" }}
                className="hover:opacity-70"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {wishlistProducts.length === 0 ? (
              <div className="py-16 text-center">
                <Heart className="mx-auto mb-4 h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
                <p style={{ color: "var(--color-text)" }}>{t("store.wishlistEmpty")}</p>
              </div>
            ) : (
              <>
                <div className="divide-y px-4">
                  {wishlistProducts.map((product) => (
                    <div key={product.id} className="flex gap-3 py-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden" style={{ backgroundColor: "var(--color-primary-soft)", borderRadius: "var(--radius)" }}>
                        {isValidImageUrl(product.imageUrl) ? (
                          <Image src={product.imageUrl!} alt={product.name} width={64} height={64} unoptimized={!canOptimizeImage(product.imageUrl)} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-6 w-6" style={{ color: "var(--color-text-muted)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {product.name}
                        </h4>
                        <p className="text-sm" style={{ color: "var(--color-primary)" }}>
                          {convertAndFormatPrice(salePriceOf(product).price, store.currency, selectedCurrency, priceLocale)}
                        </p>
                      </div>
                      <button
                        onClick={() => wishlist.toggle(product.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                        aria-label={t("store.removeFromWishlist")}
                      >
                        <Heart className="h-4 w-4 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t px-4 py-4" style={{ borderColor: "var(--color-primary-soft)" }}>
                  <button
                    onClick={() => {
                      setShowWishlist(false);
                      setShowCart(true);
                    }}
                    className="theme-btn-primary w-full py-2.5 text-sm font-semibold"
                  >
                    {t("store.addAllToCart")}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Recently Viewed Drawer */}
      {showRecentlyViewed && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowRecentlyViewed(false)}
          />
          <div
            className="fixed inset-y-0 end-0 z-50 w-full max-w-md overflow-y-auto shadow-xl"
            style={{ backgroundColor: "var(--color-background)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-4"
              style={{ borderColor: "var(--color-primary-soft)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {t("store.recentlyViewedTitle", { count: recentlyViewed.items.length })}
              </h2>
              <button
                onClick={() => setShowRecentlyViewed(false)}
                style={{ color: "var(--color-text-muted)" }}
                className="hover:opacity-70"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {recentlyViewed.items.length === 0 ? (
              <div className="py-16 text-center">
                <History className="mx-auto mb-4 h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
                <p style={{ color: "var(--color-text)" }}>{t("store.recentlyViewedEmpty")}</p>
              </div>
            ) : (
              <>
                <div className="divide-y px-4">
                  {recentlyViewed.items.map((product) => (
                    <div key={product.id} className="flex gap-3 py-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden" style={{ backgroundColor: "var(--color-primary-soft)", borderRadius: "var(--radius)" }}>
                        {isValidImageUrl(product.imageUrl) ? (
                          <Image src={product.imageUrl!} alt={product.name} width={64} height={64} unoptimized={!canOptimizeImage(product.imageUrl)} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-6 w-6" style={{ color: "var(--color-text-muted)" }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {product.name}
                        </h4>
                        <p className="text-sm" style={{ color: "var(--color-primary)" }}>
                          {convertAndFormatPrice(salePriceOf(product).price, store.currency, selectedCurrency, priceLocale)}
                        </p>
                      </div>
                      <Link
                        href={productPath(slug, product.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                        aria-label={t("store.viewProduct")}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* AI Shopping Assistant */}
      <AIShoppingAssistant slug={slug} store={store} />

      {/* Footer */}
      <StoreFooter hasWhiteLabel={store.hasWhiteLabel} />
    </div>
  );
}

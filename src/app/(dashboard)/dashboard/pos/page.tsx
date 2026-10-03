"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Banknote,
  CreditCard,
  Loader2,
  Minus,
  Package,
  Plus,
  ReceiptText,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import POSReceiptModal, {
  type PosReceipt,
} from "@/components/pos/POSReceiptModal";

interface PosProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryId: string | null;
  isVisible: boolean;
}

interface PosCategory {
  id: string;
  name: string;
}

interface CartLine {
  productId: string;
  name: string;
  imageUrl: string;
  unitPrice: number;
  stock: number;
  quantity: number;
}

type PaymentMethod = "cash" | "card";
type DiscountType = "percent" | "fixed";

/** Longest pause (ms) between keystrokes that still counts as one scanner burst. */
const SCAN_MAX_INTERVAL_MS = 45;
const SCAN_MIN_LENGTH = 3;
const SCAN_MAX_LENGTH = 64;
const LOW_STOCK_THRESHOLD = 3;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseAmount(value: string): number {
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

interface PosBundle {
  products: PosProduct[];
  categories: PosCategory[];
  cashierName: string;
}

/** Network-only fetch (no state) so effects can chain it without setState. */
async function fetchPosBundle(): Promise<PosBundle> {
  try {
    const [prodRes, catRes, meRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/categories"),
      fetch("/api/auth/me"),
    ]);
    const prodData = await prodRes.json();
    const catData = await catRes.json();
    const meData = meRes.ok ? await meRes.json() : null;
    return {
      products: prodData.products || [],
      categories: catData.categories || [],
      cashierName: meData?.user?.name || meData?.user?.email || "",
    };
  } catch (error) {
    console.error("Failed to load POS data:", error);
    return { products: [], categories: [], cashierName: "" };
  }
}

/**
 * Smart POS & Cashier Sales Engine.
 *
 * Split-screen register: a touch-friendly catalogue (search + USB barcode
 * scanner listener + category tabs) on the left, and the active order with
 * discount/VAT math and cash/card tendering on the right. Completing a sale
 * books a paid `channel: "pos"` order and opens the 80mm receipt preview.
 */
export default function PosPage() {
  const { t, formatMoney } = useI18n();

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [cashierName, setCashierName] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Catalogue filters
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Active register
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountInput, setDiscountInput] = useState("");
  const [taxRateInput, setTaxRateInput] = useState("14");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);

  /** Keep catalogue + register stock views in sync after any refresh. */
  const applyProducts = useCallback((rows: PosProduct[]) => {
    setProducts(rows);
    setCart((current) =>
      current
        .map((line) => {
          const product = rows.find((row) => row.id === line.productId);
          if (!product) return line;
          return {
            ...line,
            stock: product.stock,
            quantity: Math.min(line.quantity, product.stock),
          };
        })
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json();
      applyProducts(data.products || []);
    } catch (error) {
      console.error("Failed to refresh products:", error);
    }
  }, [applyProducts]);

  useEffect(() => {
    let cancelled = false;

    fetchPosBundle().then((bundle) => {
      if (cancelled) return;
      applyProducts(bundle.products);
      setCategories(bundle.categories);
      setCashierName(bundle.cashierName);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [applyProducts]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ---------------------------------------------------------------
  // Cart operations
  // ---------------------------------------------------------------
  const addToCart = useCallback(
    (product: PosProduct, quantity = 1, announce = false) => {
      const existing = cart.find((line) => line.productId === product.id);
      const currentQty = existing?.quantity ?? 0;

      if (product.stock <= 0 || currentQty + quantity > product.stock) {
        setToast(t("pos.toast.stock", { name: product.name }));
        return;
      }

      if (existing) {
        setCart(
          cart.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: line.quantity + quantity }
              : line
          )
        );
      } else {
        setCart([
          ...cart,
          {
            productId: product.id,
            name: product.name,
            imageUrl: product.imageUrl || "",
            unitPrice: round2(parseAmount(product.price)),
            stock: product.stock,
            quantity,
          },
        ]);
      }

      if (announce) setToast(t("pos.scanned.added", { name: product.name }));
    },
    [cart, t]
  );

  const changeQuantity = useCallback((productId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const next = Math.min(
            Math.max(line.quantity + delta, 0),
            line.stock
          );
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }, []);

  // ---------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------
  const itemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () => round2(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)),
    [cart]
  );

  const discountValue = Math.max(parseAmount(discountInput), 0);
  const taxRate = Math.min(Math.max(parseAmount(taxRateInput), 0), 100);

  const discountAmount =
    discountType === "percent"
      ? round2((subtotal * Math.min(discountValue, 100)) / 100)
      : Math.min(round2(discountValue), subtotal);
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2((taxable * taxRate) / 100);
  const total = round2(taxable + taxAmount);

  // ---------------------------------------------------------------
  // Barcode scanner (USB keyboard-wedge) listener
  // ---------------------------------------------------------------
  const resolveScanRef = useRef<(code: string) => boolean>(() => false);

  const resolveScan = useCallback(
    (rawCode: string): boolean => {
      const code = rawCode.trim();
      if (!code) return false;
      const needle = code.toLowerCase();

      // Exact id wins; for identical names prefer the variant that can
      // actually be sold, otherwise the first match (which surfaces the
      // "not enough stock" toast).
      const byId = products.find((product) => product.id.toLowerCase() === needle);
      const sameName = products.filter(
        (product) => product.name.trim().toLowerCase() === needle
      );
      const exact =
        byId ?? sameName.find((product) => product.stock > 0) ?? sameName[0];

      if (exact) {
        addToCart(exact, 1, true);
        return true;
      }

      const partial = products.filter((product) =>
        product.name.toLowerCase().includes(needle)
      );
      if (partial.length === 1) {
        addToCart(partial[0], 1, true);
        return true;
      }

      setToast(t("pos.scanned.notFound", { code }));
      return false;
    },
    [products, addToCart, t]
  );

  useEffect(() => {
    resolveScanRef.current = resolveScan;
  }, [resolveScan]);

  useEffect(() => {
    let buffer = "";
    let lastAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const now = Date.now();
      if (now - lastAt > SCAN_MAX_INTERVAL_MS) buffer = "";
      lastAt = now;

      if (event.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (
          !typingInField &&
          !event.ctrlKey &&
          !event.metaKey &&
          code.length >= SCAN_MIN_LENGTH &&
          code.length <= SCAN_MAX_LENGTH
        ) {
          event.preventDefault();
          resolveScanRef.current(code);
        }
        return;
      }

      if (
        typingInField ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        return;
      }

      buffer += event.key;
      if (buffer.length > SCAN_MAX_LENGTH) buffer = "";
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = search.trim();
    if (!code) return;
    resolveScan(code);
    setSearch("");
  }

  // ---------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------
  async function completeSale() {
    if (cart.length === 0) {
      setToast(t("pos.toast.emptyCart"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
          discountType,
          discountValue,
          taxRate,
          paymentMethod,
        }),
      });

      const data = res.ok ? await res.json() : await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.code === "INSUFFICIENT_STOCK") {
          const line = cart.find((item) => item.productId === data.productId);
          setToast(
            line
              ? t("pos.toast.stock", { name: line.name })
              : t("pos.toast.failed")
          );
          await loadProducts();
          return;
        }
        throw new Error(data?.error || "sale failed");
      }

      setReceipt(data.sale as PosReceipt);
      setCart([]);
      setDiscountInput("");
      setDiscountType("percent");
      setToast(t("pos.toast.completed"));
      await loadProducts();
    } catch (error) {
      console.error("POS sale failed:", error);
      setToast(t("pos.toast.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------
  // Catalogue filtering
  // ---------------------------------------------------------------
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const inCategory =
        activeCategory === "all" || product.categoryId === activeCategory;
      const matches =
        query === "" ||
        product.name.toLowerCase().includes(query) ||
        (product.description || "").toLowerCase().includes(query);
      return inCategory && matches;
    });
  }, [products, search, activeCategory]);

  const inCartQty = (productId: string) =>
    cart.find((line) => line.productId === productId)?.quantity ?? 0;

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* ---------------- Left: catalogue & scanner ---------------- */}
        <section className="min-w-0 flex-1">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("pos.search.placeholder")}
                aria-label={t("pos.search.placeholder")}
                autoFocus
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <ScanLine className="h-3.5 w-3.5" />
              {t("pos.scanner.ready")}
            </span>
          </div>

          {/* Category tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeCategory === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {t("pos.category.all")}
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  activeCategory === category.id
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl bg-white p-3 shadow-sm"
                >
                  <div className="h-28 rounded-lg bg-slate-200" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-slate-200" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl bg-white py-16 text-center shadow-sm">
              <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <p className="text-lg font-medium text-slate-600">
                {t("pos.catalog.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t("pos.catalog.emptySubtitle")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((product) => {
                const quantityInCart = inCartQty(product.id);
                const stockBadge =
                  product.stock <= 0
                    ? "bg-red-100 text-red-700"
                    : product.stock <= LOW_STOCK_THRESHOLD
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700";

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    className="group flex flex-col overflow-hidden rounded-xl bg-white text-start shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="relative h-28 bg-slate-100">
                      {isValidImageUrl(product.imageUrl) ? (
                        <Image
                          src={product.imageUrl!}
                          alt={product.name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          unoptimized={!canOptimizeImage(product.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-10 w-10 text-slate-300" />
                        </div>
                      )}
                      <span
                        className={`absolute end-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${stockBadge}`}
                      >
                        {product.stock <= 0
                          ? t("products.outOfStock")
                          : product.stock <= LOW_STOCK_THRESHOLD
                            ? t("pos.stock.low", { count: product.stock })
                            : t("products.inStock", { count: product.stock })}
                      </span>
                      {quantityInCart > 0 && (
                        <span className="absolute bottom-2 end-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          {quantityInCart}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="line-clamp-2 text-sm font-medium text-slate-900">
                        {product.name}
                      </h3>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-base font-bold text-indigo-600">
                          {formatMoney(product.price)}
                        </span>
                        <span className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- Right: active register ---------------- */}
        <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[400px]">
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShoppingCart className="h-4 w-4 text-indigo-600" />
                  {t("pos.register.title")}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {cashierName
                    ? `${t("pos.cashier")}: ${cashierName}`
                    : t("pos.status.ready")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                {t("pos.register.items", { count: itemCount })}
              </span>
            </div>

            {/* Cart lines */}
            <div className="max-h-[40vh] space-y-2 overflow-y-auto px-4 py-3 xl:max-h-[38vh]">
              {cart.length === 0 ? (
                <div className="py-8 text-center">
                  <ReceiptText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    {t("pos.cart.emptyTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("pos.cart.emptySubtitle")}
                  </p>
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.productId}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2"
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                      {isValidImageUrl(line.imageUrl) ? (
                        <Image
                          src={line.imageUrl}
                          alt={line.name}
                          width={36}
                          height={36}
                          unoptimized={!canOptimizeImage(line.imageUrl)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {line.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatMoney(line.unitPrice)} × {line.quantity} ={" "}
                        <span className="font-semibold text-indigo-600">
                          {formatMoney(line.unitPrice * line.quantity)}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.productId, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-white"
                        aria-label={`${t("common.delete")} ${line.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-slate-900">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.productId, 1)}
                        disabled={line.quantity >= line.stock}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`+ ${line.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Discount + VAT */}
            <div className="space-y-2 border-t border-dashed border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pos-discount"
                  className="text-sm font-medium text-slate-600"
                >
                  {t("pos.discount.label")}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="pos-discount"
                    type="number"
                    min={0}
                    value={discountInput}
                    onChange={(event) => setDiscountInput(event.target.value)}
                    placeholder="0"
                    className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-end focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex overflow-hidden rounded-lg border border-slate-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setDiscountType("percent")}
                      aria-pressed={discountType === "percent"}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        discountType === "percent"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {t("pos.discount.unit.percent")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("fixed")}
                      aria-pressed={discountType === "fixed"}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        discountType === "fixed"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {t("pos.discount.unit.fixed")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pos-tax-rate"
                  className="text-sm font-medium text-slate-600"
                >
                  {t("pos.vatRate.label")}
                </label>
                <input
                  id="pos-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={taxRateInput}
                  onChange={(event) => setTaxRateInput(event.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-end focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Totals */}
            <dl className="space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">{t("pos.subtotal")}</dt>
                <dd className="font-medium text-slate-900">
                  {formatMoney(subtotal)}
                </dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-emerald-600">
                  <dt>{t("pos.discount.label")}</dt>
                  <dd className="font-medium">- {formatMoney(discountAmount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">
                  {t("pos.vat", { rate: taxRate })}
                </dt>
                <dd className="font-medium text-slate-900">
                  {formatMoney(taxAmount)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-lg font-bold text-slate-900">
                <dt>{t("pos.total")}</dt>
                <dd>{formatMoney(total)}</dd>
              </div>
            </dl>

            {/* Payment actions */}
            <div className="space-y-2 border-t border-slate-100 px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  aria-pressed={paymentMethod === "cash"}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    paymentMethod === "cash"
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  {t("pos.pay.cash")}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  aria-pressed={paymentMethod === "card"}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    paymentMethod === "card"
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  {t("pos.pay.card")}
                </button>
              </div>

              <button
                type="button"
                onClick={completeSale}
                disabled={submitting || cart.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptText className="h-4 w-4" />
                )}
                {t("pos.complete")}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {receipt && (
        <POSReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}

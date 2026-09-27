"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  X,
  Package,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import ImageUploadField from "@/components/ImageUploadField";
import { canOptimizeImage, isValidImageUrl } from "@/lib/images";
import type { BillingInfo } from "@/lib/types";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  isVisible: boolean;
  categoryId: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductsBundle {
  products: Product[];
  categories: Category[];
  storeId: string | null;
  billing: BillingInfo | null;
}

/** Network-only fetch (no state) so effects can chain it without setState. */
async function fetchProductsBundle(): Promise<ProductsBundle> {
  try {
    const [prodRes, catRes, meRes, billingRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/categories"),
      fetch("/api/auth/me"),
      fetch("/api/billing"),
    ]);
    const prodData = await prodRes.json();
    const catData = await catRes.json();
    const meData = meRes.ok ? await meRes.json() : null;
    const billing: BillingInfo | null = billingRes.ok ? await billingRes.json() : null;
    return {
      products: prodData.products || [],
      categories: catData.categories || [],
      storeId: meData?.store?.id ?? null,
      billing,
    };
  } catch (error) {
    console.error("Failed to load products:", error);
    return { products: [], categories: [], storeId: null, billing: null };
  }
}

export default function ProductsPage() {
  const { t, formatMoney } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formStock, setFormStock] = useState("0");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formIsVisible, setFormIsVisible] = useState(true);

  // AI description generator
  const [aiOpen, setAiOpen] = useState(false);
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const loadData = useCallback(async () => {
    const bundle = await fetchProductsBundle();
    setProducts(bundle.products);
    setCategories(bundle.categories);
    if (bundle.storeId) setStoreId(bundle.storeId);
    setBilling(bundle.billing);
  }, []);

  useEffect(() => {
    fetchProductsBundle()
      .then((bundle) => {
        setProducts(bundle.products);
        setCategories(bundle.categories);
        if (bundle.storeId) setStoreId(bundle.storeId);
        setBilling(bundle.billing);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const atLimit =
    billing !== null &&
    billing.productLimit !== null &&
    billing.productCount >= billing.productLimit;

  function openAddForm() {
    if (atLimit) {
      setToast(t("products.toast.limitReached"));
      return;
    }
    setEditingProduct(null);
    setFormName("");
    setFormDescription("");
    setFormPrice("");
    setFormStock("0");
    setFormImageUrl("");
    setFormCategoryId("");
    setFormIsVisible(true);
    setAiOpen(false);
    setAiKeywords("");
    setAiLoading(false);
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);
    setFormName(product.name);
    setFormDescription(product.description || "");
    setFormPrice(product.price);
    setFormStock(product.stock.toString());
    setFormImageUrl(product.imageUrl || "");
    setFormCategoryId(product.categoryId || "");
    setFormIsVisible(product.isVisible);
    setAiOpen(false);
    setAiKeywords("");
    setAiLoading(false);
    setShowForm(true);
  }

  async function handleGenerateDescription() {
    if (!formName.trim()) {
      setToast(t("products.ai.needName"));
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, keywords: aiKeywords }),
      });
      if (!res.ok) throw new Error("Failed to generate description");

      const payload = (await res.json()) as { description?: string };
      if (!payload.description) throw new Error("Empty description");

      setFormDescription(payload.description);
      setAiOpen(false);
      setToast(t("products.toast.aiGenerated"));
    } catch {
      setToast(t("ai.failed"));
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingProduct) {
        const res = await fetch("/api/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProduct.id,
            name: formName,
            description: formDescription,
            price: formPrice,
            stock: parseInt(formStock),
            imageUrl: formImageUrl,
            categoryId: formCategoryId || null,
            isVisible: formIsVisible,
          }),
        });

        if (!res.ok) throw new Error("Failed to update product");
        setToast(t("products.toast.updated"));
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription,
            price: formPrice,
            stock: parseInt(formStock),
            imageUrl: formImageUrl,
            categoryId: formCategoryId || null,
            isVisible: formIsVisible,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          if (payload?.code === "PRODUCT_LIMIT_REACHED") {
            setToast(t("products.toast.limitReached"));
            setShowForm(false);
            loadData();
            return;
          }
          throw new Error("Failed to create product");
        }
        setToast(t("products.toast.created"));
      }

      setShowForm(false);
      loadData();
    } catch {
      setToast(t("products.toast.saveFailed"));
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("products.deleteConfirm"))) return;

    try {
      const res = await fetch(`/api/products?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setToast(t("products.toast.deleted"));
      loadData();
    } catch {
      setToast(t("products.toast.deleteFailed"));
    }
  }

  async function toggleVisibility(product: Product) {
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          isVisible: !product.isVisible,
        }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      loadData();
    } catch {
      setToast(t("products.toast.visibilityFailed"));
    }
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("products.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={openAddForm}
          disabled={atLimit}
          title={atLimit ? t("products.toast.limitReached") : undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("products.add")}
        </button>
      </div>

      {/* Free plan product limit banner */}
      {atLimit && billing && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("products.planUsage", {
              used: billing.productCount,
              limit: billing.productLimit ?? 0,
            })}
          </span>
          <Link
            href="/dashboard/billing"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            {t("products.upgrade")}
          </Link>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingProduct ? t("products.editTitle") : t("products.addTitle")}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("products.field.name")}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("products.field.description")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setAiOpen((open) => !open)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("ai.generate")}
                  </button>
                </div>

                {aiOpen && (
                  <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50/70 p-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {t("products.ai.keywords")}
                    </label>
                    <input
                      type="text"
                      value={aiKeywords}
                      onChange={(e) => setAiKeywords(e.target.value)}
                      placeholder={t("products.ai.keywordsPlaceholder")}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      {t("products.ai.hint")}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateDescription}
                        disabled={aiLoading}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {aiLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {aiLoading ? t("ai.generating") : t("ai.generate")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiOpen(false)}
                        disabled={aiLoading}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  dir="auto"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("products.field.price")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("products.field.stock")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {storeId && (
                <ImageUploadField
                  storeId={storeId}
                  field="product"
                  label={t("products.field.image")}
                  value={formImageUrl}
                  onChange={setFormImageUrl}
                />
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("products.field.category")}
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">{t("products.noCategory")}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isVisible"
                  checked={formIsVisible}
                  onChange={(e) => setFormIsVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="isVisible"
                  className="text-sm text-slate-700"
                >
                  {t("products.visibleLabel")}
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingProduct ? t("common.update") : t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-white p-4 shadow-sm"
            >
              <div className="mb-3 h-32 rounded-lg bg-slate-200" />
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="mt-2 h-4 w-1/2 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("products.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("products.emptySubtitle")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative h-40 overflow-hidden rounded-t-xl bg-slate-100">
                {isValidImageUrl(product.imageUrl) ? (
                  <Image
                    src={product.imageUrl!}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized={!canOptimizeImage(product.imageUrl)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-12 w-12 text-slate-300" />
                  </div>
                )}
                <button
                  onClick={() => toggleVisibility(product)}
                  className={`absolute end-2 top-2 rounded-full p-1.5 ${
                    product.isVisible
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-200 text-slate-500"
                  }`}
                  title={
                    product.isVisible ? t("products.visible") : t("products.hidden")
                  }
                >
                  {product.isVisible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="p-4">
                <h3 className="font-medium text-slate-900">{product.name}</h3>
                <p className="mt-1 text-sm text-slate-500 line-clamp-1">
                  {product.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-bold text-indigo-600">
                    {formatMoney(product.price)}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      product.stock > 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {product.stock > 0
                      ? t("products.inStock", { count: product.stock })
                      : t("products.outOfStock")}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => openEditForm(product)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Edit2 className="h-3 w-3" />
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

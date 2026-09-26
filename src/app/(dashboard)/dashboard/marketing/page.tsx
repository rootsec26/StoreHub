"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Megaphone, Package, Sparkles } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";

interface Product {
  id: string;
  name: string;
  price: string;
  isVisible: boolean;
}

const PLATFORMS = [
  {
    id: "facebook",
    labelKey: "marketing.platform.facebook",
    activeClass: "border-blue-600 bg-blue-600 text-white",
    idleClass:
      "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600",
  },
  {
    id: "instagram",
    labelKey: "marketing.platform.instagram",
    activeClass: "border-pink-600 bg-pink-600 text-white",
    idleClass:
      "border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600",
  },
  {
    id: "tiktok",
    labelKey: "marketing.platform.tiktok",
    activeClass: "border-slate-900 bg-slate-900 text-white",
    idleClass:
      "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
  },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

export default function MarketingPage() {
  const { t, formatMoney } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState<PlatformId>("facebook");
  const [keywords, setKeywords] = useState("");

  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState("");
  const [postMeta, setPostMeta] = useState<{
    product: string;
    platform: PlatformId;
  } | null>(null);
  const [source, setSource] = useState<"openai" | "mock" | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/products")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { products?: Product[] } | null) => {
        if (cancelled) return;
        const list = payload?.products ?? [];
        setProducts(list);
        if (list.length > 0) setProductId(list[0].id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleGenerate() {
    if (!productId) {
      setToast(t("marketing.selectProduct"));
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/ai/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, platform, keywords }),
      });
      if (!res.ok) throw new Error("Failed to generate post");

      const payload = (await res.json()) as {
        post?: string;
        platform?: PlatformId;
        productName?: string;
        source?: "openai" | "mock";
      };
      if (!payload.post) throw new Error("Empty post");

      setPost(payload.post);
      setPostMeta({
        product: payload.productName ?? "",
        platform: payload.platform ?? platform,
      });
      setSource(payload.source ?? null);
      setCopied(false);
      setToast(t("marketing.toast.generated"));
    } catch {
      setToast(t("marketing.toast.failed"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post);
      setCopied(true);
      setToast(t("ai.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast(t("ai.copyFailed"));
    }
  }

  const selectedProduct = products.find((p) => p.id === productId);
  const platformLabelKey: TranslationKey =
    PLATFORMS.find((p) => p.id === platform)?.labelKey ??
    "marketing.platform.facebook";

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <p className="mb-6 text-sm text-slate-500">{t("marketing.subtitle")}</p>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="h-5 w-40 rounded bg-slate-200" />
              <div className="mt-6 h-10 w-full rounded-lg bg-slate-200" />
              <div className="mt-4 h-10 w-full rounded-lg bg-slate-200" />
              <div className="mt-4 h-24 w-full rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center shadow-sm">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">
            {t("marketing.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("marketing.emptySubtitle")}
          </p>
          <Link
            href="/dashboard/products"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("products.add")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Generator */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2">
                <Megaphone className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {t("marketing.generate")}
                </h3>
                <p className="text-xs text-slate-500">
                  {t("marketing.subtitle")}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("marketing.product")}
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">{t("marketing.selectProduct")}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {formatMoney(product.price)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("marketing.platform")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPlatform(item.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        platform === item.id ? item.activeClass : item.idleClass
                      }`}
                      aria-pressed={platform === item.id}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("marketing.angle")}
                </label>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  rows={2}
                  placeholder={t("marketing.anglePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !selectedProduct}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generating ? t("marketing.generating") : t("marketing.generate")}
              </button>
            </div>
          </div>

          {/* Output */}
          <div className="flex flex-col rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t("marketing.output")}
                </h3>
                {source === "mock" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    {t("ai.mockBadge")}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!post}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {t("ai.copy")}
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !selectedProduct}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("ai.regenerate")}
                </button>
              </div>
            </div>

            {postMeta && (
              <p className="mb-3 text-xs text-slate-500">
                {t("marketing.postFor", {
                  product: postMeta.product,
                  platform: t(
                    PLATFORMS.find((p) => p.id === postMeta.platform)?.labelKey ??
                      platformLabelKey
                  ),
                })}
              </p>
            )}

            {post ? (
              <pre
                dir="auto"
                className="min-h-64 flex-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700"
              >
                {post}
              </pre>
            ) : (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <Sparkles className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {t("marketing.outputPlaceholder")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

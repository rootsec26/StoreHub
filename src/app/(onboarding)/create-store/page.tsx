"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Loader2,
  Check,
  X,
  Globe,
  FileText,
  Tag,
  Phone,
  MapPin,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

const CATEGORY_KEYS: TranslationKey[] = [
  "category.Fashion",
  "category.Electronics",
  "category.Food & Drinks",
  "category.Home & Garden",
  "category.Beauty",
  "category.Sports",
  "category.Books",
  "category.Other",
];

const CATEGORY_VALUES = [
  "Fashion",
  "Electronics",
  "Food & Drinks",
  "Home & Garden",
  "Beauty",
  "Sports",
  "Books",
  "Other",
] as const;

interface SlugCheck {
  slug: string;
  available: boolean | null;
}

export default function CreateStorePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [slugInput, setSlugInput] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [slugCheck, setSlugCheck] = useState<SlugCheck | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Derived slug: follows the store name until it is edited manually.
  const autoSlug = useMemo(() => {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
  }, [name]);

  const slug = slugInput ?? autoSlug;
  const slugFormatOk = slug.length >= 2 && /^[a-z0-9-]+$/.test(slug);
  const currentCheck = slugCheck && slugCheck.slug === slug ? slugCheck : null;
  const checkingSlug = slugFormatOk && currentCheck === null;
  const slugAvailable = !slug || slug.length < 2
    ? null
    : !slugFormatOk
      ? false
      : currentCheck
        ? currentCheck.available
        : null;

  // Debounced availability check — state only updates inside the async
  // callbacks, never synchronously from the effect body.
  useEffect(() => {
    if (!slugFormatOk) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/stores?slug=${slug}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setSlugCheck({
            slug,
            available: typeof data.available === "boolean" ? data.available : null,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setSlugCheck({ slug, available: null });
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, slugFormatOk]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          category,
          phone,
          address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("onboarding.createFailed"));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("auth.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-xl">
      <div className="mb-6 text-center">
        <div className="mb-4 flex items-center justify-between">
          <span />
          <LanguageToggle compact />
        </div>
        <div className="mx-auto mb-4 inline-flex rounded-xl bg-indigo-100 p-3">
          <Store className="h-8 w-8 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("onboarding.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t("onboarding.subtitle")}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("onboarding.storeName")}
          </label>
          <div className="relative">
            <Store className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboarding.storeNamePlaceholder")}
              required
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("onboarding.slug")}
          </label>
          <div className="relative">
            <Globe className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              dir="ltr"
              value={slug}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
              placeholder="my-awesome-store"
              required
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="absolute end-3 top-1/2 -translate-y-1/2">
              {checkingSlug && (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              )}
              {!checkingSlug && slugAvailable === true && (
                <Check className="h-4 w-4 text-emerald-500" />
              )}
              {!checkingSlug && slugAvailable === false && (
                <X className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500" dir="ltr">
            {t("onboarding.slugUrl", { slug: slug || "..." })}
          </p>
          {slugAvailable === false && (
            <p className="mt-1 text-xs text-red-500">
              {t("onboarding.slugTaken")}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("onboarding.description")}
          </label>
          <div className="relative">
            <FileText className="absolute start-3 top-3 h-4 w-4 text-slate-400" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("onboarding.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("settings.category")}
          </label>
          <div className="relative">
            <Tag className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">{t("settings.selectCategory")}</option>
              {CATEGORY_VALUES.map((value, index) => (
                <option key={value} value={value}>
                  {t(CATEGORY_KEYS[index])}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("settings.phone")}
          </label>
          <div className="relative">
            <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+20 100 123 4567"
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t("settings.address")}
          </label>
          <div className="relative">
            <MapPin className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("onboarding.addressPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !slugAvailable}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Store className="h-4 w-4" />
          )}
          {loading ? t("onboarding.creating") : t("onboarding.submit")}
        </button>
      </form>
    </div>
  );
}

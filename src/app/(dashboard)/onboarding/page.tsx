"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store, CheckCircle } from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [slugValid, setSlugValid] = useState(true);
  const [slugChecking, setSlugChecking] = useState(false);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  };

  const handleStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStoreName(value);
    if (!storeSlug || storeSlug === generateSlug(storeName)) {
      setStoreSlug(generateSlug(value));
    }
  };

  const checkSlugAvailability = async (slug: string) => {
    if (!slug || slug.length < 2) {
      setSlugValid(true);
      return;
    }
    setSlugChecking(true);
    try {
      const res = await fetch(`/api/stores/check-slug?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setSlugValid(data.available);
    } catch {
      setSlugValid(true);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleStoreSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");
    setStoreSlug(value);
    checkSlugAvailability(value);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!storeName.trim()) {
      setError(t("onboarding.storeNameRequired"));
      setLoading(false);
      return;
    }

    if (!storeSlug.trim()) {
      setError(t("onboarding.storeSlugRequired"));
      setLoading(false);
      return;
    }

    if (!slugValid) {
      setError(t("onboarding.slugTaken"));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName.trim(),
          slug: storeSlug.trim(),
          description: description.trim(),
          category: category.trim(),
          phone: phone.trim(),
          address: address.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("onboarding.failed"));
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1000);
    } catch (err) {
      console.error("[onboarding] unexpected error:", err);
      setError(t("onboarding.somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  const categories = [
    "retail",
    "electronics",
    "fashion",
    "food",
    "health",
    "home",
    "sports",
    "beauty",
    "automotive",
    "books",
    "other",
  ];

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-slate-900">
              {t("onboarding.storeCreated")}
            </h1>
            <p className="text-slate-600">{t("onboarding.redirecting")}</p>
            <Loader2 className="mx-auto mt-6 h-8 w-8 animate-spin text-indigo-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="w-full max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
            <Store className="h-6 w-6 text-indigo-600" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">
            {t("onboarding.title")}
          </h1>
          <p className="text-slate-600">{t("onboarding.subtitle")}</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {t("onboarding.storeName")} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Store className="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={storeName}
                onChange={handleStoreNameChange}
                placeholder={t("onboarding.storeNamePlaceholder")}
                required
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <p className="text-xs text-slate-500">{t("onboarding.storeNameHelp")}</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {t("onboarding.storeSlug")} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                storehub.io/
              </span>
              <input
                type="text"
                value={storeSlug}
                onChange={handleStoreSlugChange}
                placeholder={t("onboarding.storeSlugPlaceholder")}
                required
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-28 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              {slugChecking && (
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
              )}
              {!slugChecking && storeSlug && (
                <span className={slugValid ? "text-emerald-600" : "text-red-600"}>
                  {slugValid
                    ? t("onboarding.slugAvailable")
                    : t("onboarding.slugTaken")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">{t("onboarding.storeSlugHelp")}</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {t("onboarding.category")}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">{t("onboarding.selectCategory")}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`category.${cat}` as TranslationKey) || cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              {t("onboarding.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("onboarding.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-lg border border-slate-300 py-2.5 px-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("onboarding.phone")}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("onboarding.phonePlaceholder")}
                className="w-full rounded-lg border border-slate-300 py-2.5 px-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.address")}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("onboarding.addressPlaceholder")}
                className="w-full rounded-lg border border-slate-300 py-2.5 px-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                {t("onboarding.createStore")}
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {t("onboarding.skipForNow")}{" "}
          <button
            onClick={() => router.push("/dashboard")}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            {t("onboarding.goToDashboard")}
          </button>
        </p>
      </div>
    </div>
  );
}
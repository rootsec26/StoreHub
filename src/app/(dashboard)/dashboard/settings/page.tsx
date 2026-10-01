"use client";

import { useState, useEffect } from "react";
import {
  Store,
  FileText,
  Tag,
  Phone,
  MapPin,
  Loader2,
  Save,
  Palette,
} from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import ImageUploadField from "@/components/ImageUploadField";
import DomainSettings from "./domain-settings";
import CurrencySettings from "./currency-settings";
import PaymentSettings from "./payment-settings";
import ThemeSettings from "./theme-settings";
import { normalizeAccent } from "@/lib/theme";

interface StoreData {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  phone: string;
  address: string;
  logoUrl: string;
  coverUrl: string;
  accentColor: string;
}

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

const ACCENT_PRESETS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f5e00b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#0f172a",
];

export default function SettingsPage() {
  const { t } = useI18n();

  const [store, setStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [accentColor, setAccentColor] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.store) {
          setStore({ id: data.store.id, ...data.store } as StoreData);
          setName(data.store.name || "");
          return fetch("/api/stores/my");
        }
        return null;
      })
      .then((res) => (res ? res.json() : null))
      .then((data) => {
        if (data?.store) {
          setStore(data.store);
          setName(data.store.name || "");
          setDescription(data.store.description || "");
          setCategory(data.store.category || "");
          setPhone(data.store.phone || "");
          setAddress(data.store.address || "");
          setLogoUrl(data.store.logoUrl || "");
          setCoverUrl(data.store.coverUrl || "");
          setAccentColor(data.store.accentColor || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <Store className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("settings.title")}
            </h2>
            {store && (
              <p className="text-sm text-slate-500" dir="ltr">
                /store/{store.slug}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.storeName")}
            </label>
            <div className="relative">
              <Store className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.description")}
            </label>
            <div className="relative">
              <FileText className="absolute start-3 top-3 h-4 w-4 text-slate-400" />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {store && (
            <ImageUploadField
              storeId={store.id}
              field="logo"
              label={t("settings.logo")}
              value={logoUrl}
              onChange={setLogoUrl}
            />
          )}

          {store && (
            <ImageUploadField
              storeId={store.id}
              field="cover"
              label={t("settings.cover")}
              value={coverUrl}
              onChange={setCoverUrl}
            />
          )}

          {store && (
            <ThemeSettings storeId={store.id} />
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.brandColor")}
            </label>
            <p className="mb-2 text-xs text-slate-500">
              {t("settings.brandColorHint")}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccentColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${
                    normalizeAccent(accentColor) === color
                      ? "scale-110 border-slate-900"
                      : "border-white shadow"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={color}
                  title={color}
                />
              ))}

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <input
                  type="color"
                  value={normalizeAccent(accentColor)}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                  aria-label={t("settings.brandColorCustom")}
                />
                {t("settings.brandColorCustom")}
              </label>

              <button
                type="button"
                onClick={() => setAccentColor("")}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("settings.brandColorDefault")}
              </button>
            </div>

            <div className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white">
              <Palette className="h-4 w-4" />
              {t("settings.brandColorPreview")}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>

        {store && <DomainSettings storeSlug={store.slug} />}
        {store && <CurrencySettings storeId={store.id} />}
        {store && <PaymentSettings storeId={store.id} />}
      </div>
    </div>
  );
}
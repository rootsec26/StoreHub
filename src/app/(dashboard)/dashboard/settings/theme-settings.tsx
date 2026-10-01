"use client";

import { useState, useEffect } from "react";
import { Palette } from "lucide-react";
import { DEFAULT_THEME_CONFIG, resolveThemeConfig, type ThemeConfig, type ThemeId, type FontFamily, type BorderRadius, type HeroStyle, FONT_FAMILIES, BORDER_RADIUS_OPTIONS, HERO_STYLES, THEME_PRESETS } from "@/lib/theme-config";

import { useI18n, type TranslationKey } from "@/lib/i18n";

interface ThemeSettingsProps {
  storeId?: string;
}

export default function ThemeSettings({ storeId }: ThemeSettingsProps = {}) {
  const { t } = useI18n();

  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(DEFAULT_THEME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchThemeConfig() {
      try {
        const res = await fetch(`/api/stores/my`);
        if (!res.ok) throw new Error("Failed to fetch store");
        const data = await res.json();
        setThemeConfig(resolveThemeConfig(data.store?.themeConfig));
      } catch (error) {
        console.error("Failed to fetch theme config:", error);
        setError("Failed to load theme settings. Please try again.");
        setThemeConfig(DEFAULT_THEME_CONFIG);
      } finally {
        setLoading(false);
      }
    }

    fetchThemeConfig();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = storeId ? `/api/stores/${storeId}` : "/api/stores";
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeConfig }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update theme config");
      }
      const data = await res.json();
      setToast(t("settings.toast.saved"));
      setThemeConfig(
        data.store?.themeConfig ? resolveThemeConfig(data.store.themeConfig) : themeConfig
      );
    } catch (error) {
      console.error("Save error:", error);
      setToast(t("settings.toast.failed"));
      setError(error instanceof Error ? error.message : "Failed to save theme settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Palette className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const TEMPLATE_IDS = ["modern", "minimal", "luxury"] as ThemeId[];

const handleTemplateChange = (themeId: ThemeId) => {
    const preset = THEME_PRESETS[themeId];
    setThemeConfig({
      ...themeConfig,
      themeId,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
      fontFamily: preset.fontFamily,
      borderRadius: preset.borderRadius,
      heroStyle: preset.heroStyle,
    });
  };

  return (
    <div>
      {toast && (
        <div className="fixed end-4 top-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <Palette className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("settings.themeSettingsTitle")}
            </h2>
            {themeConfig.themeId && (
              <p className="text-sm text-slate-500" dir="ltr">
                {themeConfig.themeId}
              </p>
            )}
            {error && (
              <div className="mt-2 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.themeTemplate")}
            </label>
<div className="mt-2 flex gap-2">
              {TEMPLATE_IDS.map((themeId) => {
                const preset = THEME_PRESETS[themeId];
                return (
                  <label
                    key={themeId}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
                      themeConfig.themeId === themeId
                        ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="themeTemplate"
                      value={themeId}
                      checked={themeConfig.themeId === themeId}
                      onChange={() => handleTemplateChange(themeId)}
                      className="hidden"
                    />
                    {preset
                      ? preset.themeId === "modern"
                        ? "Modern"
                        : preset.themeId === "minimal"
                        ? "Minimal"
                        : "Luxury"
                      : "Modern"}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.primaryColor")}
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {t("settings.colorHint")}
            </p>
            <div className="relative mt-2">
              <input
                type="color"
                value={themeConfig.primaryColor}
                onChange={(e) =>
                  setThemeConfig({
                    ...themeConfig,
                    primaryColor: e.target.value,
                  })
                }
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label={t("settings.brandColorCustom")}
              />
              <div
                className="absolute right-0 inset-y-0 w-16 rounded-r-lg border-l border-slate-200"
                style={{ backgroundColor: themeConfig.primaryColor }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{themeConfig.primaryColor}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.secondaryColor")}
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {t("settings.colorHint")}
            </p>
            <div className="relative mt-2">
              <input
                type="color"
                value={themeConfig.secondaryColor}
                onChange={(e) =>
                  setThemeConfig({
                    ...themeConfig,
                    secondaryColor: e.target.value,
                  })
                }
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label={t("settings.brandColorCustom")}
              />
              <div
                className="absolute right-0 inset-y-0 w-16 rounded-r-lg border-l border-slate-200"
                style={{ backgroundColor: themeConfig.secondaryColor }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{themeConfig.secondaryColor}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.backgroundColor")}
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {t("settings.colorHint")}
            </p>
            <div className="relative mt-2">
              <input
                type="color"
                value={themeConfig.backgroundColor}
                onChange={(e) =>
                  setThemeConfig({
                    ...themeConfig,
                    backgroundColor: e.target.value,
                  })
                }
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                aria-label={t("settings.brandColorCustom")}
              />
              <div
                className="absolute right-0 inset-y-0 w-16 rounded-r-lg border-l border-slate-200"
                style={{ backgroundColor: themeConfig.backgroundColor }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{themeConfig.backgroundColor}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.fontFamily")}
            </label>
            <select
              value={themeConfig.fontFamily}
              onChange={(e) =>
                setThemeConfig({
                  ...themeConfig,
                  fontFamily: e.target.value as FontFamily,
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.borderRadius")}
            </label>
            <select
              value={themeConfig.borderRadius}
              onChange={(e) =>
                setThemeConfig({
                  ...themeConfig,
                  borderRadius: e.target.value as BorderRadius,
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {BORDER_RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.heroStyle")}
            </label>
            <select
              value={themeConfig.heroStyle}
              onChange={(e) =>
                setThemeConfig({
                  ...themeConfig,
                  heroStyle: e.target.value as HeroStyle,
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {HERO_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.showAnnouncementBar")}
            </label>
            <select
              value={themeConfig.showAnnouncementBar ? "true" : "false"}
              onChange={(e) =>
                setThemeConfig({
                  ...themeConfig,
                  showAnnouncementBar: e.target.value === "true",
                })
              }
              className="mt-2 block w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("settings.announcementText")}
            </label>
            <div className="relative mt-2">
              <input
                value={themeConfig.announcementText || ""}
                onChange={(e) =>
                  setThemeConfig({
                    ...themeConfig,
                    announcementText: e.target.value,
                  })
                }
                placeholder={t("settings.announcementTextPlaceholder")}
                className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <span className="animate-spin h-4 w-4" />
              ) : (
                <span className="h-4 w-4" />
              )}
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
          </form>
    </div>
  </div>
);
}
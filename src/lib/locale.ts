export type Locale = "en" | "ar";

export const LOCALE_STORAGE_KEY = "storehub_locale";

/** Fallback locale used when no saved localStorage/cookie preference exists. */
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ar";
}

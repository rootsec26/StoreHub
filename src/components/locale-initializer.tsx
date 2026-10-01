"use server";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale } from "@/lib/locale";

export async function getInitialLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_STORAGE_KEY)?.value;
  if (localeCookie === "en" || localeCookie === "ar") {
    return localeCookie;
  }
  return DEFAULT_LOCALE;
}
"use server";

import { cookies } from "next/headers";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n";

export async function getInitialLocale(): Promise<"en" | "ar"> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_STORAGE_KEY)?.value;
  if (localeCookie === "en" || localeCookie === "ar") {
    return localeCookie;
  }
  return "en";
}
/**
 * Official StoreHub Android app (APK) download link.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_ANDROID_APK_URL — absolute URL (Supabase Storage public
 *      object, GitHub Release asset, or CDN).
 *   2. Local fallback served from /public/download/storehub.apk.
 */
export const ANDROID_APK_URL: string =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? "/download/storehub.apk";

export const ANDROID_APP_NAME = "StoreHub";

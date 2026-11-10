/**
 * Runtime platform detection for app shells (Capacitor Android, Tauri desktop).
 * Used with useSyncExternalStore: the client snapshot reads `window`, the
 * server snapshot always returns false so SSR/SSG renders the web variant.
 */

export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export function isTauriDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/** True when running inside any StoreHub native app shell (Android/iOS/desktop). */
export function isNativeAppShell(): boolean {
  return isCapacitorNativeApp() || isTauriDesktopApp();
}

/**
 * Opens an external URL. Inside the Tauri desktop shell `target="_blank"`
 * navigation is a no-op, so we hand the URL to the OS default browser via
 * the shell plugin. Everywhere else falls back to window.open.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriDesktopApp()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

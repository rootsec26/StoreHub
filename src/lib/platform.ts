/**
 * Runtime platform detection for app shells (Capacitor Android, Tauri desktop).
 * Used with useSyncExternalStore: the client snapshot reads `window`, the
 * server snapshot always returns false so SSR/SSG renders the web variant.
 */

// Native app shells (Capacitor / Tauri) are temporarily disabled — every
// detector reports "web" so OAuth, routing, and shell UI all use the
// standard browser flow. Restore the real checks to re-enable the apps.
export function isCapacitorNativeApp(): boolean {
  return false;
}

export function isTauriDesktopApp(): boolean {
  return false;
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

/**
 * Opens a StoreHub page (e.g. a storefront) in a separate Tauri window so
 * merchants can keep the dashboard open alongside it. Reuses/focuses an
 * existing window for the same label instead of stacking duplicates.
 */
export async function openStoreWindow(
  url: string,
  label: string,
  title: string
): Promise<void> {
  if (!isTauriDesktopApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.unminimize();
    await existing.setFocus();
    return;
  }

  await new WebviewWindow(label, {
    url,
    title,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    decorations: false,
    center: true,
  });
}

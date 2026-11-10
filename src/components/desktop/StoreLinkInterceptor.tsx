"use client";

import { useEffect } from "react";
import { isTauriDesktopApp, openStoreWindow } from "@/lib/platform";

/**
 * Global click interceptor for the Tauri desktop shell.
 *
 * Any same-origin storefront link (`/store/...`) with target="_blank" —
 * whether patched individually or not — is routed to a dedicated app window
 * instead of leaking to the system browser or dying as a no-op navigation.
 * External links are left untouched so they still open in the browser.
 */
export default function StoreLinkInterceptor() {
  useEffect(() => {
    if (!isTauriDesktopApp()) return;

    function onClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement | null)?.closest?.(
        'a[target="_blank"]'
      );
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }

      // Only same-origin storefront links — external URLs keep default behavior.
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith("/store/")) return;

      e.preventDefault();
      e.stopPropagation();

      const slug = url.pathname.split("/")[2] || "store";
      void openStoreWindow(
        url.toString(),
        `store-${slug}`,
        `StoreHub — ${slug}`
      );
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

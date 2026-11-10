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

    // Also intercept programmatic window.open() calls for storefront URLs
    // (e.g. shipping-labels tracking links) so they never reach the browser.
    const originalOpen = window.open.bind(window);
    window.open = (
      url?: string | URL,
      target?: string,
      features?: string
    ): Window | null => {
      if (url != null) {
        try {
          const parsed = new URL(String(url), window.location.origin);
          if (
            parsed.origin === window.location.origin &&
            parsed.pathname.startsWith("/store/")
          ) {
            const slug = parsed.pathname.split("/")[2] || "store";
            void openStoreWindow(
              parsed.toString(),
              `store-${slug}`,
              `StoreHub — ${slug}`
            );
            return null;
          }
        } catch {
          // fall through to native window.open
        }
      }
      return originalOpen(url, target, features);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.open = originalOpen;
    };
  }, []);

  return null;
}

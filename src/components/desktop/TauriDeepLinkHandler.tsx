"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { deepLinkToPath } from "@/lib/deep-link";
import { isTauriDesktopApp, openStoreWindow } from "@/lib/platform";

/**
 * Handles `storehub://` deep links inside the Tauri desktop shell.
 *
 * - On cold start, `getCurrent()` returns the URL that launched the app.
 * - While running, `onOpenUrl` fires for every subsequent deep link.
 *
 * Store links open in a dedicated store window (same behavior as
 * StoreLinkInterceptor); everything else navigates the main window.
 */
export default function TauriDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!isTauriDesktopApp()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function handle(urls: string[] | null) {
      const raw = urls?.[0];
      if (!raw) return;
      const path = deepLinkToPath(raw);
      if (!path || cancelled) return;

      if (path.startsWith("/store/")) {
        const slug = path.split("/")[2] || "store";
        await openStoreWindow(
          `${window.location.origin}${path}`,
          `store-${slug}`,
          `StoreHub — ${slug}`
        );
        return;
      }
      router.push(path);
    }

    void (async () => {
      const deepLink = await import("@tauri-apps/plugin-deep-link");
      await handle(await deepLink.getCurrent());
      if (cancelled) return;
      unlisten = await deepLink.onOpenUrl((urls) => void handle(urls));
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [router]);

  return null;
}

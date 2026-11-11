"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { deepLinkToPath } from "@/lib/deep-link";
import { completeOAuthDeepLink } from "@/lib/oauth";
import { isTauriDesktopApp, openStoreWindow } from "@/lib/platform";

/**
 * Handles `storehub://` deep links inside the Tauri desktop shell.
 *
 * - On cold start, `getCurrent()` returns the URL that launched the app.
 * - While running, `onOpenUrl` fires for every subsequent deep link.
 * - `storehub://auth/callback?…` finishes a Google OAuth sign-in: the PKCE
 *   code is exchanged and the app session cookie is set before navigating.
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
      if (!raw || cancelled) return;

      // OAuth callback deep link — completes sign-in, then navigates.
      const oauthTarget = await completeOAuthDeepLink(raw);
      if (oauthTarget) {
        // Full navigation so the freshly set `session` cookie is picked up
        // by the proxy — router.push can serve a stale unauthenticated
        // render and leave the user looking logged out (same reason the
        // Capacitor handler uses window.location.assign).
        window.location.assign(oauthTarget);
        return;
      }

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

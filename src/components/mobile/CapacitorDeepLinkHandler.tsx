"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { deepLinkToPath } from "@/lib/deep-link";
import { completeOAuthDeepLink, isOAuthDeepLink } from "@/lib/oauth";
import { isCapacitorNativeApp } from "@/lib/platform";

/**
 * Handles deep links inside the Capacitor Android shell.
 *
 * - Cold start: `App.getLaunchUrl()` returns the URL that opened the app.
 * - Warm start: `appUrlOpen` fires for every subsequent deep link
 *   (`com.storehub.app://…` custom scheme and verified https App Links).
 * - `…://auth/callback?…` finishes a Google OAuth sign-in: the PKCE code is
 *   exchanged and the app session cookie is set before navigating.
 */
export default function CapacitorDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let cancelled = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    async function handle(raw: string | undefined | null) {
      if (!raw || cancelled) return;

      // OAuth callback deep link — completes sign-in, then navigates.
      if (isOAuthDeepLink(raw)) {
        const oauthTarget = await completeOAuthDeepLink(raw);
        if (cancelled) return;
        if (oauthTarget) {
          // Full navigation so the freshly set `session` cookie is picked up
          // by the proxy/middleware — same reason /auth/callback uses
          // window.location.replace on web. router.push can serve a stale
          // unauthenticated render and leave the user looking logged out.
          window.location.assign(oauthTarget);
        } else {
          console.error("[deep-link] OAuth callback failed:", raw);
          router.push("/login");
        }
        return;
      }

      const path = deepLinkToPath(raw);
      if (!path || cancelled) return;
      router.push(path);
    }

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");

        // Register the warm-start listener first so an appUrlOpen event
        // arriving while we await getLaunchUrl() is not missed.
        listenerHandle = await App.addListener("appUrlOpen", (event) => {
          void handle(event.url);
        });
        if (cancelled) {
          await listenerHandle.remove();
          return;
        }

        const launch = await App.getLaunchUrl();
        await handle(launch?.url);
      } catch (err) {
        console.error("[deep-link] Capacitor listener failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      void listenerHandle?.remove();
    };
  }, [router]);

  return null;
}

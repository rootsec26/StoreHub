"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { deepLinkToPath } from "@/lib/deep-link";
import { completeOAuthDeepLink } from "@/lib/oauth";
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

    async function handle(raw: string | undefined | null) {
      if (!raw || cancelled) return;

      // OAuth callback deep link — completes sign-in, then navigates.
      const oauthTarget = await completeOAuthDeepLink(raw);
      if (oauthTarget) {
        router.push(oauthTarget);
        return;
      }

      const path = deepLinkToPath(raw);
      if (!path || cancelled) return;
      router.push(path);
    }

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");

        const launch = await App.getLaunchUrl();
        await handle(launch?.url);
        if (cancelled) return;

        await App.addListener("appUrlOpen", (event) => {
          void handle(event.url);
        });
      } catch (err) {
        console.error("[deep-link] Capacitor listener failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

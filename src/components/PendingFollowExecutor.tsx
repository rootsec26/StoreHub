"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FOLLOW_SYNC_EVENT,
  getStoredFollowerId,
} from "@/lib/follow-action";

const FOLLOW_ACTIONS = new Set(["follow_platform", "follow_store"]);
const STORE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Completes a deferred follow action after sign-in.
 *
 * Follow buttons bounce logged-out visitors to `/login?next=<path>?action=…`;
 * once the OAuth/password flow lands back on the page, this executor verifies
 * the session, performs the follow on behalf of the user, strips the action
 * params from the URL and notifies mounted follow buttons via
 * `FOLLOW_SYNC_EVENT` so they re-render in the "following" state.
 */
export default function PendingFollowExecutor() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action || !FOLLOW_ACTIONS.has(action)) return;

    const dedupeKey = `${action}:${searchParams.get("store") ?? ""}`;
    if (handledRef.current === dedupeKey) return;
    handledRef.current = dedupeKey;

    let cancelled = false;

    (async () => {
      try {
        // Only signed-in users get the deferred follow — the session cookie
        // is what ties the follow row to their account.
        const me = await fetch("/api/auth/me", { cache: "no-store" });
        if (me.ok) {
          const followerId = getStoredFollowerId() ?? undefined;
          const body = JSON.stringify(
            followerId ? { followerId } : {}
          );

          if (action === "follow_platform") {
            await fetch("/api/platform/follow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
          } else {
            const slug = searchParams.get("store") ?? "";
            if (STORE_SLUG_RE.test(slug)) {
              await fetch("/api/storefront/followers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slug,
                  ...(followerId ? { followerId } : {}),
                }),
              });
            }
          }

          window.dispatchEvent(new Event(FOLLOW_SYNC_EVENT));
        }
      } catch {
        // Follow is best-effort — never block the page on it.
      }

      if (!cancelled) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("action");
        params.delete("store");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, pathname, router]);

  return null;
}

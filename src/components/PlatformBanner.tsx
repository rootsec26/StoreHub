"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

import type { PlatformBroadcastDTO } from "@/lib/platform-banner-types";

const DISMISS_KEY = "storehub_banner_dismissed";

/**
 * Global site-wide announcement bar. Fetches the live platform broadcast and
 * renders nothing when there is none, it has expired, or the visitor dismissed
 * it for this session.
 */
export default function PlatformBanner() {
  const [broadcast, setBroadcast] = useState<PlatformBroadcastDTO | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");

    let cancelled = false;
    fetch("/api/platform-banner", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { broadcast?: PlatformBroadcastDTO | null } | null) => {
        if (cancelled || !data?.broadcast) return;
        const expiresAt = new Date(data.broadcast.expiresAt).getTime();
        // Double-check expiry client-side so a cached response can't leak.
        if (expiresAt <= Date.now()) return;
        setBroadcast(data.broadcast);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // Hide exactly when the broadcast expires, even if the page stays open.
  useEffect(() => {
    if (!broadcast) return;
    const ms = new Date(broadcast.expiresAt).getTime() - Date.now();
    // Always hide via the timeout callback (async) — never synchronously.
    const timer = setTimeout(() => setBroadcast(null), Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [broadcast]);

  if (!broadcast || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="relative bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-10 py-2 text-center text-sm font-medium">
        <Megaphone className="h-4 w-4 shrink-0 text-indigo-200" />
        <span className="line-clamp-2 sm:line-clamp-none">{broadcast.message}</span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-indigo-200 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

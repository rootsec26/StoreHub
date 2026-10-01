import { useEffect, useState } from "react";

import type { PromotionRecord } from "@/lib/promotions";

// Client-side React hooks for the Promotions & Flash Sales engine.
// Kept separate from `@/lib/promotions` (pure helpers) so server components
// and API routes never pull React hook APIs into their module graph.

/**
 * Ticks once per second after mount. Returns `null` during SSR/first paint so
 * server and client render identical markup (avoids hydration mismatches).
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    // First tick is deferred so the effect body stays free of synchronous
    // setState calls (keeps hydration markup identical and lint clean).
    const timeoutId = setTimeout(update, 0);
    const intervalId = setInterval(update, intervalMs);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [intervalMs]);

  return now;
}

// ---------------------------------------------------------------------------
// Storefront campaigns data
// ---------------------------------------------------------------------------

const PROMOTIONS_REFRESH_MS = 30_000;

interface PromotionsCacheEntry {
  fetchedAt: number;
  data: PromotionRecord[];
}

const promotionsCache = new Map<string, PromotionsCacheEntry>();
const promotionsListeners = new Map<
  string,
  Set<(data: PromotionRecord[]) => void>
>();
const promotionsInFlight = new Map<string, Promise<void>>();

async function fetchStorePromotions(slug: string): Promise<void> {
  const existing = promotionsInFlight.get(slug);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(
        `/api/promotions?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      const payload = (await response.json()) as {
        promotions?: PromotionRecord[];
      };
      const data = Array.isArray(payload.promotions) ? payload.promotions : [];
      promotionsCache.set(slug, { fetchedAt: Date.now(), data });
      promotionsListeners.get(slug)?.forEach((listener) => listener(data));
    } catch {
      // Transient failures keep the last known campaigns on screen.
    } finally {
      promotionsInFlight.delete(slug);
    }
  })();

  promotionsInFlight.set(slug, request);
  return request;
}

/**
 * Live and upcoming flash sales for a storefront, refreshed in the background
 * so banners and sale prices stay current without a page reload. Every
 * subscriber of the same slug shares a single request. `initial` seeds the
 * first render from the server-side query (hydration-safe).
 */
export function useStorePromotions(
  slug: string,
  initial?: PromotionRecord[] | null
): PromotionRecord[] {
  const [promotions, setPromotions] = useState<PromotionRecord[]>(() => {
    const cached = promotionsCache.get(slug);
    if (cached) return cached.data;
    return initial ?? [];
  });

  useEffect(() => {
    if (!slug) return undefined;

    const listener = (data: PromotionRecord[]) => setPromotions(data);
    const existing = promotionsListeners.get(slug);
    const listeners = existing ?? new Set<(data: PromotionRecord[]) => void>();
    if (!existing) promotionsListeners.set(slug, listeners);
    listeners.add(listener);

    const cached = promotionsCache.get(slug);
    if (!cached || Date.now() - cached.fetchedAt >= PROMOTIONS_REFRESH_MS) {
      void fetchStorePromotions(slug);
    }

    const intervalId = setInterval(() => {
      void fetchStorePromotions(slug);
    }, PROMOTIONS_REFRESH_MS);

    return () => {
      clearInterval(intervalId);
      listeners.delete(listener);
      if (listeners.size === 0 && promotionsListeners.get(slug) === listeners) {
        promotionsListeners.delete(slug);
      }
    };
  }, [slug]);

  return promotions;
}

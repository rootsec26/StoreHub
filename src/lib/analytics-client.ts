const VISITOR_STORAGE_KEY = "storehub_analytics_visitor_id";
const TRACK_ENDPOINT = "/api/analytics/track";

function createVisitorId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable anonymous visitor id for first-party analytics (localStorage only). */
export function getAnalyticsVisitorId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;

    const visitorId = createVisitorId();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
    return visitorId;
  } catch {
    return null;
  }
}

/** Fire-and-forget page view beacon; never blocks navigation or throws. */
export function trackAnalyticsPageView(path: string): void {
  if (typeof window === "undefined" || !path.startsWith("/")) return;

  const visitorId = getAnalyticsVisitorId();
  if (!visitorId) return;

  const payload = JSON.stringify({
    eventType: "PAGE_VIEW",
    visitorId,
    path,
  });

  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.(TRACK_ENDPOINT, blob)) return;
  } catch {
    // Fall through to fetch below.
  }

  fetch(TRACK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { trackAnalyticsPageView } from "@/lib/analytics-client";

const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      lastTrackedPath.current = null;
      return;
    }

    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    trackAnalyticsPageView(pathname);
  }, [pathname]);

  return null;
}

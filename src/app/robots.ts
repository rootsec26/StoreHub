import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard/",
          "/onboarding",
          "/accept-invite",
          "/login",
          "/sign-in",
          "/signup",
          "/create-store",
          "/store/*/checkout",
          "/store/*/orders",
          "/store/*/order/",
          "/store/*/track",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}

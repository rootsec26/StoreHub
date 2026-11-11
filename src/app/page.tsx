import type { Metadata } from "next";

import LandingPageClient from "@/components/landing/LandingPageClient";
import {
  AURA_SITE_DESCRIPTION,
  AURA_SITE_NAME,
  absoluteUrl,
} from "@/lib/site";

const AURA_TITLE = "Aura — Scalable SaaS Ecosystem";

export const metadata: Metadata = {
  title: { absolute: AURA_TITLE },
  description: AURA_SITE_DESCRIPTION,
  applicationName: AURA_SITE_NAME,
  keywords: [
    "Aura",
    "SaaS ecosystem",
    "scalable SaaS",
    "StoreHub",
    "Aura Academy",
    "multi-tenant e-commerce",
  ],
  openGraph: {
    type: "website",
    siteName: AURA_SITE_NAME,
    title: AURA_TITLE,
    description: AURA_SITE_DESCRIPTION,
    url: absoluteUrl("/"),
  },
  twitter: {
    card: "summary",
    title: AURA_TITLE,
    description: AURA_SITE_DESCRIPTION,
  },
};

export default function HomePage() {
  return <LandingPageClient />;
}

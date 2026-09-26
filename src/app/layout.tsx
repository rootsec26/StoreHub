import type { Metadata } from "next";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "StoreHub — Multi-Tenant E-Commerce SaaS",
    template: "%s | StoreHub",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "e-commerce",
    "online store",
    "multi-tenant",
    "storefront",
    "WhatsApp orders",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "StoreHub — Multi-Tenant E-Commerce SaaS",
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
  },
  twitter: {
    card: "summary",
    title: "StoreHub — Multi-Tenant E-Commerce SaaS",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// Applies lang/dir before first paint so the correct layout direction renders
// without a flash. Kept in sync by <I18nProvider /> afterwards.
const directionScript = `try{var k="storehub_locale";var l=localStorage.getItem(k);if(l!=="ar"&&l!=="en"){l=(navigator.language||"en").toLowerCase().indexOf("ar")===0?"ar":"en"}document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr"}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <script dangerouslySetInnerHTML={{ __html: directionScript }} />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

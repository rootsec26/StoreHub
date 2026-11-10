import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import PlatformBanner from "@/components/PlatformBanner";
import DesktopTitleBar from "@/components/desktop/DesktopTitleBar";
import StoreLinkInterceptor from "@/components/desktop/StoreLinkInterceptor";
import TauriDeepLinkHandler from "@/components/desktop/TauriDeepLinkHandler";
import CapacitorDeepLinkHandler from "@/components/mobile/CapacitorDeepLinkHandler";
import { getInitialLocale } from "@/components/locale-initializer";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/site";
import { safeUrl } from "@/lib/url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: safeUrl(getSiteUrl()),
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
  verification: {
    google: "WMFKpvfvPwEYCrftzn0dFbUlW0O_DYkZ14-unZqy0DY",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Applies lang/dir before first paint so the correct layout direction renders
// without a flash. Kept in sync by <I18nProvider /> afterwards.
// Resolution order: localStorage → cookie → default Arabic ("ar").
const directionScript = `try{var k="storehub_locale";var l=null;try{l=localStorage.getItem(k)}catch(e){}if(l!=="ar"&&l!=="en"){var p=document.cookie.split("; ");for(var i=0;i<p.length;i++){if(p[i].indexOf(k+"=")===0){l=p[i].slice(k.length+1);break}}}if(l!=="ar"&&l!=="en"){l="ar"}document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr"}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialLocale = await getInitialLocale();
  return (
    <html lang={initialLocale} dir={initialLocale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Script
          id="storehub-locale-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: directionScript }}
        />
        <PlatformBanner />
        <DesktopTitleBar />
        <StoreLinkInterceptor />
        <TauriDeepLinkHandler />
        <CapacitorDeepLinkHandler />
        <AnalyticsTracker />
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cairo } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { getInitialLocale } from "@/components/locale-initializer";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/site";
import { safeUrl } from "@/lib/url";
import "./globals.css";

// Arabic-first typography: Cairo covers both Arabic and Latin scripts.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-cairo",
  fallback: ["Segoe UI", "Tahoma", "Arial", "sans-serif"],
});

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
};

// Applies lang/dir before first paint so the correct layout direction renders
// without a flash. Kept in sync by <I18nProvider /> afterwards.
// Resolution order: localStorage → cookie → default Arabic ("ar").
const directionScript = `try{var k="storehub_locale";var l=null;try{l=localStorage.getItem(k)}catch(e){}if(l!=="ar"&&l!=="en"){var p=document.cookie.split("; ");for(var i=0;i<p.length;i++){if(p[i].indexOf(k+"=")===0){l=p[i].slice(k.length+1);break}}}if(l!=="ar"&&l!=="en"){l="ar"}document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr"}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initialLocale = await getInitialLocale();
  return (
    <html lang={initialLocale} dir={initialLocale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body className={`bg-slate-50 text-slate-900 antialiased ${cairo.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: directionScript }} />
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

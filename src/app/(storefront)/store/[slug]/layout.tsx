import type { ReactNode } from "react";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { stores } from "@/db/schema";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { resolveThemeConfig, type ThemeConfig, DEFAULT_THEME_CONFIG } from "@/lib/theme-config";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function StorefrontLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  let themeConfig: ThemeConfig = DEFAULT_THEME_CONFIG;

  try {
    const storeRows = await db
      .select({
        id: stores.id,
        themeConfig: stores.themeConfig,
      })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    const store = storeRows[0];

    if (store) {
      themeConfig = resolveThemeConfig(store.themeConfig ?? undefined);
    }
  } catch (error) {
    console.error("Failed to fetch store theme config, falling back to default:", error);
    themeConfig = DEFAULT_THEME_CONFIG;
  }

  return (
    <ThemeProvider config={themeConfig}>
      <div className="min-h-screen">{children}</div>
    </ThemeProvider>
  );
}
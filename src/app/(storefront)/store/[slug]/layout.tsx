import type { ReactNode } from "react";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { stores } from "@/db/schema";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import AdminPreviewBar from "@/components/storefront/AdminPreviewBar";
import { getSession } from "@/lib/auth";
import { resolveThemeConfig, type ThemeConfig, DEFAULT_THEME_CONFIG } from "@/lib/theme-config";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function StorefrontLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  let themeConfig: ThemeConfig = DEFAULT_THEME_CONFIG;
  let canPreview = false;

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

      const session = await getSession().catch(() => null);
      canPreview = Boolean(session?.storeId && session.storeId === store.id);
    }
  } catch (error) {
    console.error("Failed to fetch store theme config, falling back to default:", error);
    themeConfig = DEFAULT_THEME_CONFIG;
  }

  return (
    <ThemeProvider config={themeConfig}>
      {canPreview && <AdminPreviewBar />}
      <div className="min-h-screen">{children}</div>
    </ThemeProvider>
  );
}
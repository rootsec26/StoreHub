import { NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const store = result[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    return NextResponse.json({ store: safeStore });
  } catch (error) {
    console.error("Get store error:", error);
    return createErrorResponse(error, "Failed to fetch store");
  }
}

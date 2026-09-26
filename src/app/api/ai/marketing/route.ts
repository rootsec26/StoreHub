import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { AI_PLATFORMS, generateMarketingPost, type AiPlatform } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { products, stores } from "@/db/schema";

export const runtime = "nodejs";

/**
 * POST /api/ai/marketing
 * Generates a copy-ready Arabic social post (Facebook / Instagram / TikTok)
 * for one of the merchant's own products.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const productId = typeof body?.productId === "string" ? body.productId : "";
    const platform = typeof body?.platform === "string" ? body.platform : "";
    const keywords = typeof body?.keywords === "string" ? body.keywords.trim() : "";

    if (!productId) {
      return NextResponse.json({ error: "Product is required" }, { status: 400 });
    }
    if (!AI_PLATFORMS.includes(platform as AiPlatform)) {
      return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
    }
    if (keywords.length > 400) {
      return NextResponse.json({ error: "Input is too long" }, { status: 400 });
    }

    const userStore = await db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const productResult = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.storeId, userStore[0].id)))
      .limit(1);

    if (productResult.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const product = productResult[0];
    const selectedPlatform = platform as AiPlatform;

    const result = await generateMarketingPost({
      productName: product.name,
      storeName: userStore[0].name,
      platform: selectedPlatform,
      price: product.price,
      keywords,
    });

    return NextResponse.json({
      post: result.text,
      platform: selectedPlatform,
      productName: product.name,
      source: result.source,
    });
  } catch (error) {
    console.error("AI marketing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

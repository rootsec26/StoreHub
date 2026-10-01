import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orders, orderItems, products, stores } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { createErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("id");
    const phone = searchParams.get("phone");
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { error: "Store slug is required", code: "MISSING_SLUG" },
        { status: 400 }
      );
    }

    if (!orderId && !phone) {
      return NextResponse.json(
        { error: "Order ID or phone number is required", code: "MISSING_SEARCH_PARAM" },
        { status: 400 }
      );
    }

    // Find the store by slug
    const storeResult = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    if (storeResult.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const storeId = storeResult[0].id;

    let orderResult;
    if (orderId) {
      orderResult = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
        .limit(1);
    } else if (phone) {
      orderResult = await db
        .select()
        .from(orders)
        .where(and(eq(orders.customerPhone, phone), eq(orders.storeId, storeId)))
        .orderBy(orders.createdAt)
        .limit(1);
    }

    if (!orderResult || orderResult.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const order = orderResult[0];

    // Get order items with product details
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Batch fetch all products in a single query to avoid N+1
    const productIds = items.map((item) => item.productId);
    const productMap = new Map<string, typeof products.$inferSelect>();
    if (productIds.length > 0) {
      const fetchedProducts = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));
      for (const product of fetchedProducts) {
        productMap.set(product.id, product);
      }
    }

    const itemsWithProducts = items.map((item) => ({
      ...item,
      product: productMap.get(item.productId) || null,
    }));

    return NextResponse.json({
      order: {
        ...order,
        items: itemsWithProducts,
      },
    });
  } catch (error) {
    console.error("Track order error:", error);
    return createErrorResponse(error, "Failed to track order");
  }
}
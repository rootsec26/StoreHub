import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { orders, orderItems, products, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, storeSlug } = body;

    if (!orderId || !storeSlug) {
      return NextResponse.json(
        { error: "Order ID and store slug are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    // Find the store by slug
    const storeResult = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, storeSlug))
      .limit(1);

    if (storeResult.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const storeId = storeResult[0].id;

    // Find the order and verify it belongs to the store
    const orderResult = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
      .limit(1);

    if (orderResult.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const order = orderResult[0];

    // Check if order is in pending status (only pending orders can be cancelled by customer)
    if (order.status !== "Pending") {
      return NextResponse.json(
        { error: "Only pending orders can be cancelled", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    // Get order items to restock inventory
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    // Restock inventory for each item
    for (const item of items) {
      await db
        .update(products)
        .set({
          stock: sql`${products.stock} + ${item.quantity}`,
        })
        .where(eq(products.id, item.productId));
    }

    // Update order status to cancelled
    const updatedOrder = await db
      .update(orders)
      .set({ status: "Cancelled" })
      .where(eq(orders.id, orderId))
      .returning();

    return NextResponse.json({ order: updatedOrder[0] });
  } catch (error) {
    console.error("Cancel order error:", error);
    return createErrorResponse(error, "Failed to cancel order");
  }
}
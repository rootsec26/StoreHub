import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { orders, orderItems, products, stores, orderStatusLogs } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isValidTransition } from "@/lib/order-state-machine";
import { revalidatePath } from "next/cache";

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

    // Use transaction for atomicity: lock order, validate transition, update, restock, audit log
    const result = await db.transaction(async (tx) => {
      // Lock the order row
      const orderRows = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
        .for("update")
        .limit(1);

      if (orderRows.length === 0) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const order = orderRows[0];
      const previousStatus = order.status as "Pending" | "Confirmed" | "Preparing" | "Ready" | "Shipped" | "Completed" | "Cancelled";

      // Validate state machine transition (only Pending → Cancelled allowed for customers)
      if (!isValidTransition(previousStatus, "Cancelled", false)) {
        throw new Error("INVALID_TRANSITION");
      }

      // Get order items to restock inventory
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      // Restock inventory for each item
      for (const item of items) {
        await tx
          .update(products)
          .set({
            stock: sql`${products.stock} + ${item.quantity}`,
          })
          .where(eq(products.id, item.productId));
      }

      // Update order status to cancelled
      const updatedOrder = await tx
        .update(orders)
        .set({ status: "Cancelled" })
        .where(eq(orders.id, orderId))
        .returning();

      if (updatedOrder.length === 0) {
        throw new Error("ORDER_NOT_FOUND");
      }

      // Audit log
      await tx.insert(orderStatusLogs).values({
        orderId,
        storeId,
        previousStatus,
        newStatus: "Cancelled",
        changedByUserId: null, // Customer-initiated
        ipAddress:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
      });

      return updatedOrder[0];
    });

    if (result instanceof Error) {
      if (result.message === "ORDER_NOT_FOUND") {
        return NextResponse.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          { status: 404 }
        );
      }
      if (result.message === "INVALID_TRANSITION") {
        return NextResponse.json(
          { error: "Only pending orders can be cancelled", code: "INVALID_STATUS" },
          { status: 400 }
        );
      }
    }

    // Revalidate cache
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");

    return NextResponse.json({ order: result });
  } catch (error) {
    console.error("Cancel order error:", error);
    return createErrorResponse(error, "Failed to cancel order");
  }
}
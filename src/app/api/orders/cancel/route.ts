import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orders, stores, orderStatusLogs } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isValidTransition, normalizeOrderStatus } from "@/lib/order-state-machine";
import { restockOrder } from "@/lib/warehouses-server";
import type { OrderStatus } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { verifyOrderToken } from "@/lib/order-tokens";
import { isAuthenticatedStoreOwner } from "@/lib/orders/order-access";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, storeSlug, token } = body as {
      orderId?: string;
      storeSlug?: string;
      token?: string;
    };

    if (!orderId || !storeSlug) {
      return NextResponse.json(
        { error: "Order ID and store slug are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    // Find the store by slug
    const storeResult = await db
      .select({ id: stores.id, slug: stores.slug })
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
    const storeSlugValue = storeResult[0].slug;

    // Cancellation is a destructive action. Accept either a signed
    // cancel-purpose token (customer link) or an authenticated store session.
    if (token) {
      if (!verifyOrderToken(token, { orderId, purpose: "cancel" })) {
        return NextResponse.json(
          {
            error: "Invalid or expired cancellation link",
            code: "INVALID_ORDER_TOKEN",
          },
          { status: 401 }
        );
      }
    } else if (!(await isAuthenticatedStoreOwner(storeId))) {
      return NextResponse.json(
        {
          error: "A valid cancellation link or merchant session is required",
          code: "ORDER_TOKEN_REQUIRED",
        },
        { status: 401 }
      );
    }

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
      const normalizedStatus = normalizeOrderStatus(order.status);

      // Idempotency: an already-cancelled order must not restock inventory a
      // second time (the state machine treats same→same as valid).
      if (normalizedStatus === "CANCELLED") {
        return order;
      }

      const previousStatus = normalizedStatus ?? order.status;

      // Validate state machine transition (only Pending → Cancelled allowed
      // for customers). Unknown/legacy spellings are normalized first so a
      // genuine "Pending" row is not rejected as invalid.
      if (
        !normalizedStatus ||
        !isValidTransition(previousStatus as OrderStatus, "CANCELLED", false)
      ) {
        throw new Error("INVALID_TRANSITION");
      }

      // Return catalog + branch stock for the cancelled lines
      await restockOrder(tx, { orderId, storeId });

      // Update order status to cancelled
      const updatedOrder = await tx
        .update(orders)
        .set({ status: "CANCELLED" })
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
        newStatus: "CANCELLED",
        changedByUserId: null, // Customer-initiated
        ipAddress:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
      });

      return updatedOrder[0];
    });

    // Revalidate cache
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");
    revalidatePath(`/store/${storeSlugValue}`, "layout");

    return NextResponse.json({
      order: { id: result.id, status: result.status },
    });
  } catch (error) {
    // db.transaction re-throws the sentinels — map them here (the old inner
    // `result instanceof Error` branch was unreachable dead code → 500s).
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") {
      return NextResponse.json(
        { error: "Only pending orders can be cancelled", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }
    console.error("Cancel order error:", error);
    return createErrorResponse(error, "Failed to cancel order");
  }
}
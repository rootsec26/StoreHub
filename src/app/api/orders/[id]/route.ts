import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderStatusLogs, stores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";
import {
  isValidTransition,
  validateStoreAccess,
  canManageOrders,
  hasAdminOverride,
} from "@/lib/order-state-machine";
import { revalidatePath } from "next/cache";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/orders/[id] - Update order status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check RBAC permissions
    if (!canManageOrders(session.role)) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Status is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const validStatuses = [
      "Pending",
      "Confirmed",
      "Preparing",
      "Ready",
      "Shipped",
      "Completed",
      "Cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    // Use transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Lock the order row for update
      const orderRows = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.storeId, safeStore.id)))
        .for("update")
        .limit(1);

      if (orderRows.length === 0) {
        throw new Error("FORBIDDEN");
      }

      const currentOrder = orderRows[0];
      const previousStatus = currentOrder.status as "Pending" | "Confirmed" | "Preparing" | "Ready" | "Shipped" | "Completed" | "Cancelled";

      // Validate state machine transition
      const isAdmin = hasAdminOverride(session.role);
      if (!isValidTransition(previousStatus, status, isAdmin)) {
        throw new Error("INVALID_TRANSITION");
      }

      // Update order status
      const updated = await tx
        .update(orders)
        .set({ status })
        .where(and(eq(orders.id, id), eq(orders.storeId, safeStore.id)))
        .returning();

      if (updated.length === 0) {
        throw new Error("FORBIDDEN");
      }

      // Audit log
      await tx.insert(orderStatusLogs).values({
        orderId: id,
        storeId: safeStore.id,
        previousStatus,
        newStatus: status,
        changedByUserId: session.id,
        ipAddress:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
      });

      return updated[0];
    });

    if (result instanceof Error) {
      if (result.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "Forbidden: Order not found in your store", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
      if (result.message === "INVALID_TRANSITION") {
        return NextResponse.json(
          { error: "Invalid status transition", code: "INVALID_TRANSITION" },
          { status: 400 }
        );
      }
    }

    // Revalidate cache
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/orders");

    return NextResponse.json({ order: result });
  } catch (error) {
    console.error("Update order error:", error);
    return createErrorResponse(error, "Failed to update order");
  }
}

// GET /api/orders/[id] - Get single order with items
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    const orderResult = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.storeId, safeStore.id)))
      .limit(1);

    if (orderResult.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ order: orderResult[0] });
  } catch (error) {
    console.error("Get order error:", error);
    return createErrorResponse(error, "Failed to fetch order");
  }
}
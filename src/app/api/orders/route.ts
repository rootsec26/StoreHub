import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  orders,
  orderItems,
  stores,
  products,
  orderStatusLogs,
  users,
} from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";
import { deductWarehouseStockForOrder } from "@/lib/warehouses-server";
import {
  isValidTransition,
  validateStoreAccess,
  canManageOrders,
  hasAdminOverride,
} from "@/lib/order-state-machine";
import { validateRequest, orderCreateSchema, orderStatusUpdateSchema, formatZodError } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import {
  evaluateOrderRisk,
  fetchCustomerRiskHistory,
} from "@/lib/orders/risk-engine";
import {
  expireStaleCodVerifications,
  triggerCodVerification,
} from "@/lib/orders/cod-verification";

// Get orders
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Anti-Return Fraud Shield: close verification windows that timed out so
    // the dashboard badge reflects the real state on every load.
    await expireStaleCodVerifications(safeStore.id);

    const orderId = request.nextUrl.searchParams.get("id");
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";

    const pendingRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, safeStore.id), eq(orders.status, "Pending")));
    const pendingIds = pendingRows.map((row) => row.id);

    // Lightweight payload for the realtime badge / polling fallback.
    if (summaryOnly) {
      return NextResponse.json({
        pendingCount: pendingIds.length,
        pendingIds,
      });
    }

    if (orderId) {
      // Get single order with items
      const orderResult = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, safeStore.id)))
        .limit(1);

      if (orderResult.length === 0) {
        return NextResponse.json(
          { error: "Order not found", code: "ORDER_NOT_FOUND" },
          { status: 404 }
        );
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

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
        order: orderResult[0],
        items: itemsWithProducts,
      });
    }

    // Get all orders for store
    const result = await db
      .select()
      .from(orders)
      .where(eq(orders.storeId, safeStore.id))
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({
      orders: result,
      pendingCount: pendingIds.length,
      storeSlug: safeStore.slug,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return createErrorResponse(error, "Failed to fetch orders");
  }
}

// Create order (public checkout)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const validation = validateRequest(orderCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { storeId, customerName, customerPhone, customerAddress, notes, items, paymentMethod } =
      validation.data;

    // Verify store access
    if (!validateStoreAccess(storeId, session.storeId)) {
      return NextResponse.json(
        { error: "Forbidden: Cannot create orders for another store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += item.unitPrice * item.quantity;
    }

    // Smart COD Verification: pay-later orders are scored and gated behind a
    // WhatsApp confirmation before fulfilment.
    const isCodOrder = paymentMethod === "cod" || paymentMethod === "manual";
    const risk = isCodOrder
      ? evaluateOrderRisk(
          {
            customerAddress: customerAddress || "",
            customerPhone: customerPhone || "",
            totalAmount,
          },
          await fetchCustomerRiskHistory({ storeId, phone: customerPhone })
        )
      : null;

    // Create order
    const orderResult = await db
      .insert(orders)
      .values({
        storeId,
        customerName,
        customerPhone: customerPhone || "",
        customerAddress: customerAddress || "",
        notes: notes || "",
        totalAmount: String(totalAmount.toFixed(2)),
        status: "Pending",
        ...(isCodOrder && paymentMethod && risk
          ? {
              paymentMethod,
              codVerificationStatus: "PENDING_VERIFICATION" as const,
              riskScore: risk.riskScore,
              riskReasons: risk.riskReasons,
            }
          : {}),
      })
      .returning();

    const order = orderResult[0];

    // Create order items
    const orderItemsData = items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    }));

    await db.insert(orderItems).values(orderItemsData);

    // Multi-Warehouse engine: deduct from the branch closest to the customer
    // city (or the main warehouse) when the store tracks locations.
    await deductWarehouseStockForOrder({
      storeId,
      customerAddress: customerAddress || "",
      items,
    });

    if (isCodOrder) {
      try {
        await triggerCodVerification(order.id, { origin: request.nextUrl.origin });
      } catch (error) {
        console.error("COD verification trigger failed:", error);
      }
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Create order error:", error);
    return createErrorResponse(error, "Failed to create order");
  }
}

// Update order status
export async function PATCH(request: NextRequest) {
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
    const validation = validateRequest(orderStatusUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { id, status } = validation.data;

    // Use transaction for atomicity: lock order row, validate transition, update, audit log
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
    // The transaction re-throws these sentinels, so map them to HTTP statuses.
    if (error instanceof Error && error.message === "INVALID_TRANSITION") {
      return NextResponse.json(
        { error: "Invalid status transition", code: "INVALID_TRANSITION" },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden: Order not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    console.error("Update order error:", error);
    return createErrorResponse(error, "Failed to update order");
  }
}
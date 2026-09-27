import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems, stores, products } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

// Get orders
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const orderId = request.nextUrl.searchParams.get("id");
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";

    const pendingRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.storeId, userStore[0].id), eq(orders.status, "Pending")));
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
        .where(and(eq(orders.id, orderId), eq(orders.storeId, userStore[0].id)))
        .limit(1);

      if (orderResult.length === 0) {
        return NextResponse.json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, { status: 404 });
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
      .where(eq(orders.storeId, userStore[0].id))
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({
      orders: result,
      pendingCount: pendingIds.length,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return createErrorResponse(error, "Failed to fetch orders");
  }
}

// Create order (public checkout)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, customerName, customerPhone, customerAddress, notes, items } = body;

    if (!storeId || !customerName || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Store ID, customer name, and items are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unitPrice) * item.quantity;
    }

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
      })
      .returning();

    const order = orderResult[0];

    // Create order items
    const orderItemsData = items.map((item: any) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    }));

    await db.insert(orderItems).values(orderItemsData);

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Order ID and status are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const validStatuses = [
      "Pending",
      "Confirmed",
      "Preparing",
      "Ready",
      "Completed",
      "Cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status", code: "INVALID_STATUS" }, { status: 400 });
    }

    const result = await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, id), eq(orders.storeId, userStore[0].id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Forbidden: Order not found in your store", code: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json({ order: result[0] });
  } catch (error) {
    console.error("Update order error:", error);
    return createErrorResponse(error, "Failed to update order");
  }
}

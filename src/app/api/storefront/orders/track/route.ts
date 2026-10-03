import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, shippingZones, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { summarizeShipment } from "@/lib/shipping";
import { isValidOrderId, isValidPhoneNumber, normalizePhoneDigits } from "@/lib/order-tracking";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug")?.trim() || "";
    const orderId = searchParams.get("id")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";

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

    if (orderId && !isValidOrderId(orderId)) {
      return NextResponse.json(
        { error: "Invalid order ID format", code: "INVALID_ORDER_ID" },
        { status: 400 }
      );
    }

    if (phone && !isValidPhoneNumber(phone)) {
      return NextResponse.json(
        { error: "Invalid phone number format", code: "INVALID_PHONE" },
        { status: 400 }
      );
    }

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
    } else {
      const phoneDigits = normalizePhoneDigits(phone);
      orderResult = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            or(
              eq(orders.customerPhone, phone),
              sql`regexp_replace(${orders.customerPhone}, '\\D', '', 'g') = ${phoneDigits}`
            )
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);
    }

    if (orderResult.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const order = orderResult[0];

    let zoneDays: number | null = null;
    if (order.shippingZoneId) {
      const zoneRows = await db
        .select({ days: shippingZones.estimatedDeliveryDays })
        .from(shippingZones)
        .where(eq(shippingZones.id, order.shippingZoneId))
        .limit(1);
      zoneDays = zoneRows[0]?.days ?? null;
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

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

    return NextResponse.json({
      order: {
        ...order,
        items: items.map((item) => ({
          ...item,
          product: productMap.get(item.productId) || null,
        })),
      },
      // Branded live tracking page payload (progress + carrier + ETA).
      shipping: summarizeShipment(order, zoneDays),
    });
  } catch (error) {
    console.error("Track order error:", error);
    return createErrorResponse(error, "Failed to track order");
  }
}

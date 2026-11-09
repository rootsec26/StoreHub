import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderStatusLogs } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { canManageOrders } from "@/lib/order-state-machine";

const reviewSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  action: z.enum(["approve", "reject"]),
});

/**
 * POST /api/orders/payment-proof/review
 * Merchant-side decision on a submitted transfer screenshot:
 *   approve -> paymentProofStatus=APPROVED, paymentStatus=paid
 *   reject  -> paymentProofStatus=REJECTED (buyer may resubmit)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageOrders(session.role)) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const userStore = await getAccessibleStores(session.id);
    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }
    const store = userStore[0];

    const body = await request.json();
    const validation = reviewSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid review payload", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }
    const { orderId, action } = validation.data;

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, store.id)))
      .limit(1);
    if (orderRows.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }
    const order = orderRows[0];

    if (order.paymentProofStatus !== "PENDING") {
      return NextResponse.json(
        { error: "No pending payment proof for this order", code: "NO_PENDING_PROOF" },
        { status: 409 }
      );
    }

    const approving = action === "approve";
    // Approving the transfer also confirms a still-pending order so it moves
    // straight into fulfilment; rejected proofs leave the status untouched.
    const confirmOrder = approving && order.status === "PENDING";

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(orders)
        .set({
          paymentProofStatus: approving ? "APPROVED" : "REJECTED",
          ...(approving ? { paymentStatus: "paid" } : {}),
          ...(confirmOrder ? { status: "CONFIRMED" } : {}),
        })
        .where(eq(orders.id, order.id))
        .returning({
          id: orders.id,
          paymentProofStatus: orders.paymentProofStatus,
          paymentStatus: orders.paymentStatus,
          status: orders.status,
        });

      if (confirmOrder) {
        await tx.insert(orderStatusLogs).values({
          orderId: order.id,
          storeId: store.id,
          previousStatus: order.status,
          newStatus: "CONFIRMED",
          changedByUserId: session.id,
          ipAddress:
            request.headers.get("x-forwarded-for") ??
            request.headers.get("x-real-ip") ??
            "unknown",
        });
      }

      return rows;
    });

    return NextResponse.json({ ok: true, order: updated[0] });
  } catch (error) {
    console.error("Payment proof review error:", error);
    return createErrorResponse(error, "Failed to review payment proof");
  }
}

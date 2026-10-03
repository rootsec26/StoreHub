import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { validateRequest, formatZodError } from "@/lib/validators";
import { createErrorResponse } from "@/lib/errors";
import { canManageOrders } from "@/lib/order-state-machine";
import {
  isCodOrder,
  triggerCodVerification,
} from "@/lib/orders/cod-verification";

const resendSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  locale: z.enum(["en", "ar"]).optional(),
});

/**
 * POST /api/orders/resend-verification
 * Merchant quick action: re-sends the WhatsApp COD verification message.
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

    const body = await request.json();
    const validation = validateRequest(resendSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const { order_id, locale } = validation.data;
    const storeId = userStore[0].id;

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, order_id), eq(orders.storeId, storeId)))
      .limit(1);

    if (orderRows.length === 0) {
      return NextResponse.json(
        { error: "Order not found", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const order = orderRows[0];
    if (!isCodOrder(order)) {
      return NextResponse.json(
        { error: "Order does not require COD verification", code: "NOT_COD" },
        { status: 400 }
      );
    }
    if (order.codVerificationStatus === "VERIFIED") {
      return NextResponse.json(
        { error: "Order is already verified", code: "ALREADY_VERIFIED" },
        { status: 409 }
      );
    }

    // Re-open the verification window (resend counts as a fresh attempt).
    await db
      .update(orders)
      .set({ codVerificationStatus: "PENDING_VERIFICATION" })
      .where(eq(orders.id, order_id));

    const result = await triggerCodVerification(order_id, {
      locale,
      origin: request.nextUrl.origin,
    });

    revalidatePath("/dashboard/orders");

    return NextResponse.json({
      ok: true,
      delivered: result?.delivered ?? false,
      channel: result?.channel ?? "fallback_link",
      verifyUrl: result?.verifyUrl ?? null,
      error: result?.error ?? null,
    });
  } catch (error) {
    console.error("Resend COD verification error:", error);
    return createErrorResponse(error, "Failed to resend verification message");
  }
}

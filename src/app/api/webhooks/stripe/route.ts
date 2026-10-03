import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { orders, stores, orderStatusLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/payments/stripe";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { isValidTransition } from "@/lib/order-state-machine";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

interface StripeMetadata {
  store_id?: string;
  order_id?: string;
  currency?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  order_notes?: string;
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = (session.metadata ?? {}) as StripeMetadata;
  const storeId = metadata.store_id;
  const orderId = metadata.order_id;

  if (!storeId) {
    console.warn("[stripe-webhook] No store_id in session metadata");
    return;
  }

  if (session.payment_status === "paid") {
    if (orderId) {
      await updateOrderPaymentStatus(orderId, "paid", session.id, storeId);
    } else {
      const order = await findOrderBySessionId(session.id, storeId);
      if (order) {
        await updateOrderPaymentStatus(order.id, "paid", session.id, storeId);
      }
    }
  } else if (session.payment_status === "unpaid") {
    if (orderId) {
      await updateOrderPaymentStatus(orderId, "unpaid", session.id, storeId);
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const metadata = (paymentIntent.metadata ?? {}) as StripeMetadata;
  const orderId = metadata.order_id;
  const storeId = metadata.store_id;

  if (orderId && storeId) {
    await updateOrderPaymentStatus(orderId, "paid", paymentIntent.id, storeId);
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const metadata = (paymentIntent.metadata ?? {}) as StripeMetadata;
  const orderId = metadata.order_id;
  const storeId = metadata.store_id;

  if (orderId && storeId) {
    await updateOrderPaymentStatus(orderId, "unpaid", paymentIntent.id, storeId);
  }
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  try {
    const store = await db
      .select()
      .from(stores)
      .where(eq(stores.stripeAccountId, account.id))
      .limit(1);

    if (store.length > 0) {
      await db
        .update(stores)
        .set({
          stripeEnabled:
            account.charges_enabled &&
            account.payouts_enabled &&
            account.details_submitted,
        })
        .where(eq(stores.id, store[0].id));

      console.log(`[stripe-webhook] Updated Stripe status for store ${store[0].id}`);
    }
  } catch (error) {
    console.error("[stripe-webhook] Failed to update account status:", error);
  }
}

async function findOrderBySessionId(
  sessionId: string,
  storeId: string
): Promise<typeof orders.$inferSelect | null> {
  try {
    const result = await db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.status, "Pending")))
      .orderBy(orders.createdAt);

    return result[0] || null;
  } catch {
    return null;
  }
}

async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: "paid" | "unpaid",
  stripeReference: string,
  storeId: string
): Promise<void> {
  try {
    // Use transaction to update payment_status and potentially order status
    const result = await db.transaction(async (tx) => {
      // Lock the order row
      const orderRows = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
        .for("update")
        .limit(1);

      if (orderRows.length === 0) {
        console.warn(`[stripe-webhook] Order ${orderId} not found or store mismatch`);
        return;
      }

      const currentOrder = orderRows[0];
      const previousStatus = currentOrder.status;
      const previousPaymentStatus = currentOrder.paymentStatus;

      let newOrderStatus = previousStatus;

      // If payment succeeded and order is Pending, transition to Confirmed
      if (
        paymentStatus === "paid" &&
        previousStatus === "Pending"
      ) {
        if (isValidTransition(previousStatus, "Confirmed", false)) {
          newOrderStatus = "Confirmed";
        }
      }

      // Update order
      const updated = await tx
        .update(orders)
        .set({
          paymentStatus,
          status: newOrderStatus,
        })
        .where(eq(orders.id, orderId))
        .returning();

      if (updated.length === 0) return;

      const order = updated[0];

      // Audit log for payment status change
      if (previousPaymentStatus !== paymentStatus) {
        await tx.insert(orderStatusLogs).values({
          orderId: order.id,
          storeId: order.storeId,
          previousStatus: previousPaymentStatus,
          newStatus: paymentStatus,
          changedByUserId: null, // System/webhook
          ipAddress: "stripe-webhook",
        });
      }

      // Audit log for order status change (if changed)
      if (previousStatus !== newOrderStatus) {
        await tx.insert(orderStatusLogs).values({
          orderId: order.id,
          storeId: order.storeId,
          previousStatus,
          newStatus: newOrderStatus,
          changedByUserId: null,
          ipAddress: "stripe-webhook",
        });
      }

      // Broadcast realtime update
      await broadcastOrderUpdate(order.storeId, {
        orderId: order.id,
        status: order.status,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt.toISOString(),
      });

      console.log(
        `[stripe-webhook] Updated order ${orderId}: status=${newOrderStatus}, paymentStatus=${paymentStatus}`
      );
    });
  } catch (error) {
    console.error(
      "[stripe-webhook] Failed to update order payment status:",
      error
    );
  }
}
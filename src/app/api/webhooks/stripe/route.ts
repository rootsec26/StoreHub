import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, stores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/payments/stripe";
import { broadcastOrderUpdate } from "@/lib/realtime";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event;
    try {
      event = await verifyWebhookSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe-webhook] Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 }
      );
    }

    console.log(`[stripe-webhook] Received event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as any;
        await handlePaymentIntentFailed(paymentIntent);
        break;
      }

      case "account.updated": {
        const account = event.data.object as any;
        await handleAccountUpdated(account);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: any): Promise<void> {
  const metadata = session.metadata || {};
  const storeId = metadata.store_id;
  const orderId = metadata.order_id;

  if (!storeId) {
    console.warn("[stripe-webhook] No store_id in session metadata");
    return;
  }

  if (session.payment_status === "paid") {
    if (orderId) {
      await updateOrderStatus(orderId, "PAID", session.id);
    } else {
      const order = await findOrderBySessionId(session.id, storeId);
      if (order) {
        await updateOrderStatus(order.id, "PAID", session.id);
      }
    }
  } else if (session.payment_status === "unpaid") {
    if (orderId) {
      await updateOrderStatus(orderId, "Failed", session.id);
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
  const metadata = paymentIntent.metadata || {};
  const orderId = metadata.order_id;
  const storeId = metadata.store_id;

  if (orderId && storeId) {
    await updateOrderStatus(orderId, "PAID", paymentIntent.id);
  }
}

async function handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
  const metadata = paymentIntent.metadata || {};
  const orderId = metadata.order_id;
  const storeId = metadata.store_id;

  if (orderId && storeId) {
    await updateOrderStatus(orderId, "Failed", paymentIntent.id);
  }
}

async function handleAccountUpdated(account: any): Promise<void> {
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
          stripeEnabled: account.charges_enabled && account.payouts_enabled && account.details_submitted,
        })
        .where(eq(stores.id, store[0].id));
      
      console.log(`[stripe-webhook] Updated Stripe status for store ${store[0].id}`);
    }
  } catch (error) {
    console.error("[stripe-webhook] Failed to update account status:", error);
  }
}

async function findOrderBySessionId(sessionId: string, storeId: string): Promise<typeof orders.$inferSelect | null> {
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

async function updateOrderStatus(orderId: string, status: string, stripeReference: string): Promise<void> {
  try {
    const result = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, orderId))
      .returning();

    if (result.length > 0) {
      const order = result[0];
      console.log(`[stripe-webhook] Updated order ${orderId} to ${status}`);
      
      await broadcastOrderUpdate(order.storeId, {
        orderId: order.id,
        status: order.status,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt.toISOString(),
      });
    }
  } catch (error) {
    console.error("[stripe-webhook] Failed to update order status:", error);
  }
}
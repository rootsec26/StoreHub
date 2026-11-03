import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { orders, stores, orderStatusLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/payments/stripe";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { isValidTransition, normalizeOrderStatus } from "@/lib/order-state-machine";

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
      // Never guess which order a payment belongs to: marking the oldest
      // PENDING order as paid would corrupt unrelated orders. New checkouts
      // always embed order_id in metadata (see api/checkout stripe case).
      console.warn(
        `[stripe-webhook] No order_id in session ${session.id} metadata — skipping payment confirmation`
      );
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

async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: "paid" | "unpaid",
  stripeReference: string,
  storeId: string
): Promise<void> {
  // Errors propagate to the POST handler so Stripe receives a 500 and retries.
  await db.transaction(async (tx) => {
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
    const rawStatus = currentOrder.status;
    const normalizedStatus = normalizeOrderStatus(rawStatus);
    const previousPaymentStatus = currentOrder.paymentStatus;

    // Canonicalize on write; only upgrade Pending → Confirmed on payment.
    let newOrderStatus = normalizedStatus ?? rawStatus;
    if (paymentStatus === "paid" && normalizedStatus === "PENDING") {
      if (isValidTransition("PENDING", "CONFIRMED", false)) {
        newOrderStatus = "CONFIRMED";
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
        ipAddress: `stripe-webhook:${stripeReference}`,
      });
    }

    // Audit log for order status change (if changed)
    if (normalizedStatus !== newOrderStatus) {
      await tx.insert(orderStatusLogs).values({
        orderId: order.id,
        storeId: order.storeId,
        previousStatus: rawStatus,
        newStatus: newOrderStatus,
        changedByUserId: null,
        ipAddress: `stripe-webhook:${stripeReference}`,
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
}

/**
 * POST /api/webhooks/stripe
 *
 * Verifies `stripe-signature` against the RAW request body (required by
 * Stripe) and dispatches the payment/account events. Returns:
 *   501 — webhook secret not configured (fail closed, never process unsigned)
 *   400 — missing/invalid signature
 *   500 — handler failure (Stripe will retry)
 *   200 — processed (or intentionally ignored) event
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting event");
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 501 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await verifyWebhookSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[stripe-webhook] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (error) {
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
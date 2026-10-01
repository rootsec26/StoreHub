import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores, orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCheckoutSession as createStripeCheckoutSession } from "@/lib/payments/stripe";
import { createCheckoutSession as createPaddleCheckoutSession } from "@/lib/payments/paddle";

export interface CheckoutRequest {
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  paymentMethod: "stripe" | "paddle" | "manual";
  currency: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  redirectUrl?: string | null;
  orderId?: string;
  sessionId?: string;
  message?: string;
  isSandbox?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse<CheckoutResponse>> {
  try {
    const body: CheckoutRequest = await request.json();
    
    const {
      storeId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      notes,
      items,
      paymentMethod,
      currency,
      successUrl,
      cancelUrl,
    } = body;

    if (!storeId || !customerName || !items || items.length === 0 || !paymentMethod || !currency) {
      return NextResponse.json(
        { message: "Missing required fields: storeId, customerName, items, paymentMethod, currency" },
        { status: 400 }
      );
    }

    const store = await db
      .select()
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json(
        { message: "Store not found" },
        { status: 404 }
      );
    }

    const storeData = store[0];

    const supportedCurrencies = storeData.supportedCurrencies || ["EGP", "USD", "SAR", "AED", "EUR"];
    if (!supportedCurrencies.includes(currency)) {
      return NextResponse.json(
        { message: "Currency not supported by this store" },
        { status: 400 }
      );
    }

    const defaultSuccessUrl = successUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/store/${storeData.slug}/track-order`;
    const defaultCancelUrl = cancelUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/store/${storeData.slug}/checkout`;

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += item.unitPrice * item.quantity;
    }

    switch (paymentMethod) {
      case "stripe": {
        if (!storeData.stripeEnabled || !storeData.stripeAccountId) {
          return NextResponse.json(
            { message: "Stripe is not enabled for this store" },
            { status: 400 }
          );
        }

        const stripeItems = items.map((item) => ({
          name: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
        }));

        const result = await createStripeCheckoutSession({
          storeId,
          stripeAccountId: storeData.stripeAccountId,
          currency,
          items: stripeItems,
          customerEmail,
          customerName,
          customerPhone,
          customerAddress,
          successUrl: defaultSuccessUrl,
          cancelUrl: defaultCancelUrl,
          metadata: {
            order_notes: notes || "",
          },
        });

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

        const orderItemsData = items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
        }));

        await db.insert(orderItems).values(orderItemsData);

        return NextResponse.json({
          redirectUrl: result.url,
          sessionId: result.sessionId,
          orderId: order.id,
          isSandbox: result.isSandbox,
        });
      }

      case "paddle": {
        if (!storeData.paddleEnabled) {
          return NextResponse.json(
            { message: "Paddle is not enabled for this store" },
            { status: 400 }
          );
        }

        if (!process.env.PADDLE_API_KEY) {
          return NextResponse.json(
            { message: "Paddle API key not configured" },
            { status: 500 }
          );
        }

        const paddleItems = items.map((item) => ({
          name: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
        }));

        const result = await createPaddleCheckoutSession({
          vendorId: "",
          vendorAuthCode: "",
          currency,
          items: paddleItems,
          customerEmail,
          customerName,
          customerPhone,
          customerAddress,
          successUrl: defaultSuccessUrl,
          cancelUrl: defaultCancelUrl,
          metadata: {
            order_notes: notes || "",
          },
        });

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

        const orderItemsData = items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
        }));

        await db.insert(orderItems).values(orderItemsData);

        return NextResponse.json({
          redirectUrl: result.checkoutUrl,
          orderId: order.id,
          isSandbox: result.isSandbox,
        });
      }

      case "manual": {
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

        const orderItemsData = items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
        }));

        await db.insert(orderItems).values(orderItemsData);

        const manualInstructions = storeData.manualPaymentInstructions || 
          "Please complete payment via Vodafone Cash or InstaPay and share the receipt with the merchant.";

        return NextResponse.json({
          redirectUrl: `${defaultSuccessUrl}?order_id=${order.id}&manual=true`,
          orderId: order.id,
          message: manualInstructions,
          isSandbox: false,
        });
      }

      default:
        return NextResponse.json(
          { message: "Invalid payment method" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to process checkout" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { stores, orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCheckoutSession as createStripeCheckoutSession } from "@/lib/payments/stripe";
import { createCheckoutSession as createPaddleCheckoutSession } from "@/lib/payments/paddle";
import {
  applyDiscountToItems,
  roundMoney,
  type CheckoutLoyaltyOutcome,
} from "@/lib/loyalty";
import {
  computeCheckoutLoyalty,
  finalizeCheckoutLoyalty,
} from "@/lib/loyalty-server";
import { deductWarehouseStockForOrder } from "@/lib/warehouses-server";
import { validateRequest, checkoutRequestSchema, formatZodError } from "@/lib/validators";
import { createErrorResponse } from "@/lib/errors";
import { withRateLimit, checkoutRateLimiter } from "@/lib/rate-limit";
import {
  evaluateOrderRisk,
  fetchCustomerRiskHistory,
} from "@/lib/orders/risk-engine";
import {
  triggerCodVerification,
  type CodVerificationSendResult,
} from "@/lib/orders/cod-verification";

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
  paymentMethod: "stripe" | "paddle" | "manual" | "cod";
  currency: string;
  successUrl?: string;
  cancelUrl?: string;
  /** Loyalty points the shopper chose to redeem on the slider. */
  redeemPoints?: number;
  locale?: "en" | "ar";
}

export interface CheckoutResponse {
  redirectUrl?: string | null;
  orderId?: string;
  sessionId?: string;
  message?: string;
  isSandbox?: boolean;
  /** Earned/redeemed summary rendered on the order success screen. */
  loyalty?: CheckoutLoyaltyOutcome;
  /** Anti-Return Fraud Shield verdict persisted with the order. */
  risk?: { score: "LOW" | "MEDIUM" | "HIGH"; reasons: string[] };
  /** WhatsApp COD verification hand-off (pay-later orders only). */
  codVerification?: {
    status: string;
    delivered: boolean;
    verifyUrl: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<CheckoutResponse>> {
  const rateLimitResponse = await withRateLimit(request, checkoutRateLimiter);
  if (rateLimitResponse) return rateLimitResponse as NextResponse<CheckoutResponse>;

  try {
    const body = await request.json();
    const validation = validateRequest(checkoutRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { message: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

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
      redeemPoints,
      locale,
    } = validation.data;

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
    totalAmount = roundMoney(totalAmount);

    // Smart Loyalty engine: apply the VIP tier discount and any points the
    // shopper chose to redeem. `finalTotal` is what gets charged + stored.
    const loyaltyResult = await computeCheckoutLoyalty({
      storeId,
      customerPhone: customerPhone || "",
      grossTotal: totalAmount,
      requestedPoints: Math.max(0, Math.floor(Number(redeemPoints) || 0)),
    });
    const loyaltyDiscountAmount = roundMoney(
      loyaltyResult.vipDiscount + loyaltyResult.redemptionDiscount
    );
    const finalTotal = loyaltyResult.finalTotal;
    const paymentItems =
      loyaltyDiscountAmount > 0
        ? applyDiscountToItems(items, loyaltyDiscountAmount)
        : items;

    const finalizeLoyalty = (orderId: string) =>
      finalizeCheckoutLoyalty({
        result: loyaltyResult,
        storeId,
        orderId,
        customerName,
        customerPhone: customerPhone || "",
        customerEmail: customerEmail || "",
        orderTotal: finalTotal,
      });

    // Multi-Warehouse engine: pick the closest branch from the customer city
    // (falling back to the main warehouse) and deduct the ordered units.
    const fulfilFromWarehouse = () =>
      deductWarehouseStockForOrder({
        storeId,
        customerAddress: customerAddress || "",
        items,
      });

    // Anti-Return Fraud Shield: score the buyer before the order is persisted.
    const assessRisk = async () => {
      const history = await fetchCustomerRiskHistory({
        storeId,
        phone: customerPhone,
      });
      return evaluateOrderRisk(
        {
          customerAddress: customerAddress || "",
          customerPhone: customerPhone || "",
          totalAmount: finalTotal,
        },
        history
      );
    };

    switch (paymentMethod) {
      case "stripe": {
        if (!storeData.stripeEnabled || !storeData.stripeAccountId) {
          return NextResponse.json(
            { message: "Stripe is not enabled for this store" },
            { status: 400 }
          );
        }

        const stripeItems = paymentItems.map((item) => ({
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
            totalAmount: finalTotal.toFixed(2),
            discountAmount: loyaltyDiscountAmount.toFixed(2),
            status: "Pending",
            paymentMethod: "stripe",
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

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        return NextResponse.json({
          redirectUrl: result.url,
          sessionId: result.sessionId,
          orderId: order.id,
          isSandbox: result.isSandbox,
          ...(loyaltyOutcome ? { loyalty: loyaltyOutcome } : {}),
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

        const paddleItems = paymentItems.map((item) => ({
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
            totalAmount: finalTotal.toFixed(2),
            discountAmount: loyaltyDiscountAmount.toFixed(2),
            status: "Pending",
            paymentMethod: "paddle",
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

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        return NextResponse.json({
          redirectUrl: result.checkoutUrl,
          orderId: order.id,
          isSandbox: result.isSandbox,
          ...(loyaltyOutcome ? { loyalty: loyaltyOutcome } : {}),
        });
      }

      case "manual":
      case "cod": {
        // Smart COD Verification & Anti-Return Fraud Shield: score the buyer,
        // hold the order behind a PENDING_VERIFICATION gate and message them.
        const risk = await assessRisk();

        const orderResult = await db
          .insert(orders)
          .values({
            storeId,
            customerName,
            customerPhone: customerPhone || "",
            customerAddress: customerAddress || "",
            notes: notes || "",
            totalAmount: finalTotal.toFixed(2),
            discountAmount: loyaltyDiscountAmount.toFixed(2),
            status: "Pending",
            paymentMethod,
            codVerificationStatus: "PENDING_VERIFICATION",
            riskScore: risk.riskScore,
            riskReasons: risk.riskReasons,
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

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        // Fire-and-forget: a WhatsApp outage must never break checkout.
        let codVerification: CodVerificationSendResult | null = null;
        try {
          codVerification = await triggerCodVerification(order.id, {
            locale,
            origin: request.nextUrl.origin,
          });
        } catch (error) {
          console.error("COD verification trigger failed:", error);
        }

        const manualInstructions = storeData.manualPaymentInstructions ||
          "Please complete payment via Vodafone Cash or InstaPay and share the receipt with the merchant.";

        return NextResponse.json({
          redirectUrl: `${defaultSuccessUrl}?order_id=${order.id}&manual=true`,
          orderId: order.id,
          message: manualInstructions,
          isSandbox: false,
          risk: { score: risk.riskScore, reasons: risk.riskReasons },
          ...(codVerification
            ? {
                codVerification: {
                  status: "PENDING_VERIFICATION",
                  delivered: codVerification.delivered,
                  verifyUrl: codVerification.verifyUrl,
                },
              }
            : {}),
          ...(loyaltyOutcome ? { loyalty: loyaltyOutcome } : {}),
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
    return createErrorResponse(error, "Failed to process checkout") as NextResponse<CheckoutResponse>;
  }
}
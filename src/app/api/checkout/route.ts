import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { stores, orders, orderItems, products, coupons, shippingZones } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createCheckoutSession as createStripeCheckoutSession } from "@/lib/payments/stripe";
import { createCheckoutSession as createPaddleCheckoutSession } from "@/lib/payments/paddle";
import { CouponError, validateCoupon } from "@/lib/coupons";
import { convertAmount } from "@/lib/currency";
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
import { PaywallError, sendMeteredWhatsApp } from "@/lib/paywall";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { effectiveProductPrice } from "@/lib/product-details";
import { createOrderToken } from "@/lib/order-tokens";
import { notifyCustomerOrderPlaced } from "@/lib/order-notifications";
import { computeShippingQuote } from "@/lib/shipping-pricing";
import { revalidatePath } from "next/cache";

/** Synthetic line id for the delivery fee inside gateway checkout sessions. */
const SHIPPING_LINE_PRODUCT_ID = "shipping";

function chargeLineName(item: { productId: string; name?: string }): string {
  if (item.productId === SHIPPING_LINE_PRODUCT_ID) {
    return item.name || "Shipping";
  }
  return item.productId;
}

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
    /**
     * Informational only — the server ignores it and re-prices every line from
     * the `products` row of the target store (see `resolvePricedCart`).
     */
    unitPrice?: number;
  }>;
  paymentMethod: "stripe" | "paddle" | "manual" | "cod";
  currency: string;
  successUrl?: string;
  cancelUrl?: string;
  /** Loyalty points the shopper chose to redeem on the slider. */
  redeemPoints?: number;
  /** Discount code validated server-side against this store's cart. */
  couponCode?: string;
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
  /** Signed token authorizing the buyer to upload a payment proof. */
  orderToken?: string;
  /** Delivery fee the server actually charged (store base currency). */
  shippingFee?: number;
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
      couponCode,
      locale,
      visitorId,
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

    // Redirect URLs are handed to Stripe/Paddle verbatim — they become the
    // post-payment landing page. Only same-origin URLs are allowed (the
    // storefront's own domain, subdomain or custom domain), otherwise an
    // attacker could bounce buyers to a phishing page after payment.
    const allowedRedirectOrigins = new Set<string>([request.nextUrl.origin]);
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      if (siteUrl) allowedRedirectOrigins.add(new URL(siteUrl).origin);
    } catch {
      // Malformed NEXT_PUBLIC_SITE_URL — request origin still applies.
    }
    const isAllowedRedirectUrl = (value: string | undefined): boolean => {
      if (!value) return true;
      try {
        return allowedRedirectOrigins.has(new URL(value).origin);
      } catch {
        return false;
      }
    };
    if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
      return NextResponse.json(
        { message: "Invalid redirect URL", code: "INVALID_REDIRECT_URL" },
        { status: 400 }
      ) as NextResponse<CheckoutResponse>;
    }

    const defaultSuccessUrl = successUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/store/${storeData.slug}/track-order`;
    const defaultCancelUrl = cancelUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/store/${storeData.slug}/checkout`;

    // ── Server-side pricing & tenant isolation ────────────────────────────
    // Never trust client-supplied unitPrice. Re-fetch every product scoped to
    // THIS store, reject unknown/foreign/unavailable products, merge duplicate
    // lines and rebuild the cart with DB prices only.
    const requestedIds = [...new Set(items.map((item) => item.productId))];
    const dbProducts = await db
      .select({
        id: products.id,
        price: products.price,
        salePrice: products.salePrice,
        stock: products.stock,
        availability: products.availability,
        isVisible: products.isVisible,
      })
      .from(products)
      .where(and(eq(products.storeId, storeId), inArray(products.id, requestedIds)));
    const productById = new Map(dbProducts.map((row) => [row.id, row]));

    const unavailableIds = requestedIds.filter((id) => {
      const product = productById.get(id);
      return (
        !product ||
        product.isVisible === false ||
        product.availability !== "IN_STOCK" ||
        product.stock <= 0
      );
    });
    if (unavailableIds.length > 0) {
      return NextResponse.json(
        {
          message: "One or more products are unavailable in this store",
          code: "INVALID_PRODUCT",
          productIds: unavailableIds,
        },
        { status: 400 }
      );
    }

    const mergedQuantity = new Map<string, number>();
    for (const item of items) {
      mergedQuantity.set(
        item.productId,
        (mergedQuantity.get(item.productId) ?? 0) + item.quantity
      );
    }
    const cartItems = [...mergedQuantity.entries()].map(([productId, quantity]) => {
      const product = productById.get(productId)!;
      return {
        productId,
        quantity,
        unitPrice: roundMoney(
          effectiveProductPrice({ price: product.price, salePrice: product.salePrice })
        ),
      };
    });

    let totalAmount = 0;
    for (const item of cartItems) {
      totalAmount += item.unitPrice * item.quantity;
    }
    totalAmount = roundMoney(totalAmount);

    // ── Coupon ────────────────────────────────────────────────────────────
    // Validated against this store's server-priced subtotal (never the
    // client's numbers). A code that no longer qualifies (missing / expired /
    // exhausted / min-spend) is dropped instead of blocking the purchase —
    // the buyer simply pays the undiscounted total.
    let couponDiscount = 0;
    let appliedCoupon: { id: string; code: string } | null = null;
    if (couponCode) {
      const couponCheck = await validateCoupon({
        storeId,
        code: couponCode,
        subtotal: totalAmount,
      });
      if (couponCheck.ok) {
        couponDiscount = couponCheck.discountAmount;
        appliedCoupon = { id: couponCheck.coupon.id, code: couponCheck.coupon.code };
      } else {
        console.warn(
          `Checkout coupon ${couponCode} rejected for store ${storeId}: ${couponCheck.code}`
        );
      }
    }

    // Smart Loyalty engine: apply the VIP tier discount and any points the
    // shopper chose to redeem. `finalTotal` is what gets charged + stored.
    // The coupon comes off first so loyalty never discounts an amount the
    // shopper has already been credited for.
    const loyaltyResult = await computeCheckoutLoyalty({
      storeId,
      customerPhone: customerPhone || "",
      grossTotal: roundMoney(Math.max(0, totalAmount - couponDiscount)),
      requestedPoints: Math.max(0, Math.floor(Number(redeemPoints) || 0)),
    });
    const loyaltyDiscountAmount = roundMoney(
      loyaltyResult.vipDiscount + loyaltyResult.redemptionDiscount
    );
    const totalDiscountAmount = roundMoney(couponDiscount + loyaltyDiscountAmount);
    const finalTotal = loyaltyResult.finalTotal;

    // Flexible shipping pricing: resolve the delivery fee from the store's
    // configured mode (disabled / flat / zones) and the customer's free-text
    // address. The fee is added on top of the discounted merchandise total —
    // discounts never reduce shipping — and persisted on the order row.
    const shippingZoneRows =
      storeData.shippingMode === "zones"
        ? await db
            .select({
              id: shippingZones.id,
              zoneName: shippingZones.zoneName,
              rate: shippingZones.rate,
              estimatedDeliveryDays: shippingZones.estimatedDeliveryDays,
              isActive: shippingZones.isActive,
            })
            .from(shippingZones)
            .where(
              and(
                eq(shippingZones.storeId, storeId),
                eq(shippingZones.isActive, true)
              )
            )
        : [];
    const shippingQuote = computeShippingQuote({
      mode: storeData.shippingMode,
      flatRate: storeData.shippingFlatRate,
      zones: shippingZoneRows,
      address: customerAddress,
    });
    const shippingFee = shippingQuote.fee;
    const orderTotal = roundMoney(finalTotal + shippingFee);

    const paymentItems =
      totalDiscountAmount > 0
        ? applyDiscountToItems(cartItems, totalDiscountAmount)
        : cartItems;

    // Product prices are stored in the store's base currency. The shopper may
    // pay in any supported currency, so every charge line is converted here,
    // server-side, with the same trusted rate table the storefront displays.
    // This closes the "send a cheaper currency but keep the base amount" hole.
    const storeCurrency = storeData.currency || "EGP";
    const chargeItems = paymentItems.map((item) => ({
      ...item,
      unitPrice: convertAmount(item.unitPrice, storeCurrency, currency),
    }));

    // The delivery fee rides along as its own charge line so gateway totals
    // match `orderTotal` exactly — merchandise discounts never touch it.
    const shippingCharge = convertAmount(shippingFee, storeCurrency, currency);
    const chargeLines =
      shippingCharge > 0
        ? [
            ...chargeItems,
            {
              productId: SHIPPING_LINE_PRODUCT_ID,
              quantity: 1,
              unitPrice: roundMoney(shippingCharge),
            },
          ]
        : chargeItems;

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
    const fulfilFromWarehouse = async () => {
      const result = await deductWarehouseStockForOrder({
        storeId,
        customerAddress: customerAddress || "",
        items: cartItems,
      });
      // The storefront pages are statically rendered — invalidate them so a
      // product that just hit zero stock shows the "out of stock" badge.
      revalidatePath(`/store/${storeData.slug}`, "layout");
      return result;
    };

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

    // Order + order items + the coupon usage claim are written in ONE
    // transaction: an order can never exist without its lines, and
    // `coupons.times_used` can never drift from the orders that redeemed it
    // (the `times_used < max_uses` predicate re-checks the limit under the
    // row lock, so two concurrent checkouts cannot both take the last use).
    const createOrder = async (values: typeof orders.$inferInsert) => {
      const order = await db.transaction(async (tx) => {
        const [order] = await tx.insert(orders).values(values).returning();

        await tx.insert(orderItems).values(
          cartItems.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
          }))
        );

        if (appliedCoupon) {
          const claimed = await tx
            .update(coupons)
            .set({ timesUsed: sql`${coupons.timesUsed} + 1` })
            .where(
              and(
                eq(coupons.id, appliedCoupon.id),
                eq(coupons.storeId, storeId),
                sql`${coupons.timesUsed} < ${coupons.maxUses}`
              )
            )
            .returning({ id: coupons.id });

          if (claimed.length === 0) {
            throw new CouponError(
              "COUPON_EXHAUSTED",
              "This coupon has reached its usage limit"
            );
          }
        }

        return order;
      });

      // Auto-send the tracking code to the shopper's notification inbox.
      await notifyCustomerOrderPlaced({
        storeId,
        storeSlug: storeData.slug,
        storeName: storeData.name,
        orderId: order.id,
        customerName: values.customerName ?? "",
        customerPhone: values.customerPhone ?? "",
        totalAmount: values.totalAmount ?? "0",
        currency,
        locale,
      });

      return order;
    };

    const recordOrderConversion = (
      order: { id: string },
      paymentMethod: CheckoutRequest["paymentMethod"]
    ) =>
      recordAnalyticsEvent({
        eventType: "ORDER_CREATED",
        visitorId,
        storeId,
        orderId: order.id,
        path: "/checkout",
        metadata: { paymentMethod, source: "checkout" },
      });

    // Best-effort compensation: gives the claim back when the payment session
    // (which runs AFTER the order was persisted) could not be created.
    const releaseCouponClaim = async () => {
      if (!appliedCoupon) return;
      try {
        await db
          .update(coupons)
          .set({ timesUsed: sql`GREATEST(${coupons.timesUsed} - 1, 0)` })
          .where(
            and(eq(coupons.id, appliedCoupon.id), eq(coupons.storeId, storeId))
          );
      } catch (error) {
        console.warn("Failed to release coupon claim:", error);
      }
    };

    switch (paymentMethod) {
      case "stripe": {
        if (!storeData.stripeEnabled || !storeData.stripeAccountId) {
          return NextResponse.json(
            { message: "Stripe is not enabled for this store" },
            { status: 400 }
          );
        }

        // Create the order BEFORE the Stripe session so its id can be embedded
        // in the session/payment-intent metadata — that is how the webhook
        // (api/webhooks/stripe) matches the payment to this exact order.
        const orderId = randomUUID();
        const order = await createOrder({
          id: orderId,
          storeId,
          customerName,
          customerPhone: customerPhone || "",
          customerAddress: customerAddress || "",
          notes: notes || "",
          totalAmount: orderTotal.toFixed(2),
          discountAmount: totalDiscountAmount.toFixed(2),
          shippingFee: shippingFee.toFixed(2),
          shippingZoneId: shippingQuote.zoneId,
          couponCode: appliedCoupon?.code ?? null,
          status: "PENDING",
          paymentMethod: "stripe",
        });

        await recordOrderConversion(order, "stripe");

        let result;
        try {
          const stripeItems = chargeLines.map((item) => ({
            name: chargeLineName(item),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            productId: item.productId,
          }));

          result = await createStripeCheckoutSession({
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
              order_id: orderId,
            },
          });
        } catch (error) {
          // Compensate: never leave an orphaned Pending order (nor a consumed
          // coupon use) when the payment session could not be created. The
          // items row is removed by the `on delete cascade` of the order.
          await db.delete(orders).where(eq(orders.id, orderId));
          await releaseCouponClaim();
          throw error;
        }

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        return NextResponse.json({
          redirectUrl: result.url,
          sessionId: result.sessionId,
          orderId: order.id,
          isSandbox: result.isSandbox,
          shippingFee,
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

        // Create the order BEFORE the Paddle transaction so its id can be
        // embedded in customData — that is how a payment webhook (or manual
        // reconciliation) matches the payment to this exact order. Mirrors
        // the Stripe flow.
        const orderId = randomUUID();
        const order = await createOrder({
          id: orderId,
          storeId,
          customerName,
          customerPhone: customerPhone || "",
          customerAddress: customerAddress || "",
          notes: notes || "",
          totalAmount: orderTotal.toFixed(2),
          discountAmount: totalDiscountAmount.toFixed(2),
          shippingFee: shippingFee.toFixed(2),
          shippingZoneId: shippingQuote.zoneId,
          couponCode: appliedCoupon?.code ?? null,
          status: "PENDING",
          paymentMethod: "paddle",
        });

        await recordOrderConversion(order, "paddle");

        const paddleItems = chargeLines.map((item) => ({
          name: chargeLineName(item),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
        }));

        let result;
        try {
          result = await createPaddleCheckoutSession({
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
              order_id: orderId,
              store_id: storeId,
            },
          });
        } catch (error) {
          // Compensate: never leave an orphaned Pending order (nor a consumed
          // coupon use) when the payment session could not be created.
          await db.delete(orders).where(eq(orders.id, orderId));
          await releaseCouponClaim();
          throw error;
        }

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        return NextResponse.json({
          redirectUrl: result.checkoutUrl,
          orderId: order.id,
          isSandbox: result.isSandbox,
          shippingFee,
          ...(loyaltyOutcome ? { loyalty: loyaltyOutcome } : {}),
        });
      }

      case "manual":
      case "cod": {
        // Smart COD Verification & Anti-Return Fraud Shield: score the buyer,
        // hold the order behind a PENDING_VERIFICATION gate and message them.
        const risk = await assessRisk();

        const order = await createOrder({
          storeId,
          customerName,
          customerPhone: customerPhone || "",
          customerAddress: customerAddress || "",
          notes: notes || "",
          totalAmount: orderTotal.toFixed(2),
          discountAmount: totalDiscountAmount.toFixed(2),
          shippingFee: shippingFee.toFixed(2),
          shippingZoneId: shippingQuote.zoneId,
          couponCode: appliedCoupon?.code ?? null,
          status: "PENDING",
          paymentMethod,
          codVerificationStatus: "PENDING_VERIFICATION",
          riskScore: risk.riskScore,
          riskReasons: risk.riskReasons,
        });

        await recordOrderConversion(order, paymentMethod);

        const loyaltyOutcome = await finalizeLoyalty(order.id);
        await fulfilFromWarehouse();

        // Metered + fire-and-forget: a WhatsApp outage or an empty credit
        // balance must never break checkout. The credit is deducted (with its
        // ledger row) before the provider call and refunded on a failed send.
        let codVerification: CodVerificationSendResult | null = null;
        try {
          const codOutcome = await sendMeteredWhatsApp(
            storeId,
            "COD verification (checkout)",
            () =>
              triggerCodVerification(order.id, {
                locale,
                origin: request.nextUrl.origin,
              })
          );
          codVerification = codOutcome.result;
        } catch (error) {
          if (error instanceof PaywallError) {
            console.warn(
              "COD verification skipped (WhatsApp credits):",
              error.code
            );
          } else {
            console.error("COD verification trigger failed:", error);
          }
        }

        const manualInstructions = storeData.manualPaymentInstructions ||
          "Please complete payment via Vodafone Cash or InstaPay and share the receipt with the merchant.";

        return NextResponse.json({
          redirectUrl: `${defaultSuccessUrl}?order_id=${order.id}&manual=true`,
          orderId: order.id,
          // Lets the buyer attach a transfer screenshot without an account.
          orderToken:
            paymentMethod === "manual"
              ? createOrderToken({ orderId: order.id, purpose: "payment_proof" })
              : undefined,
          message: manualInstructions,
          isSandbox: false,
          shippingFee,
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
    // The coupon claim happens inside the order transaction; if the last use
    // was taken concurrently the whole order rolls back and the buyer gets a
    // specific 400 instead of a generic 500.
    if (error instanceof CouponError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.status }
      ) as NextResponse<CheckoutResponse>;
    }
    console.error("Checkout error:", error);
    return createErrorResponse(error, "Failed to process checkout") as NextResponse<CheckoutResponse>;
  }
}
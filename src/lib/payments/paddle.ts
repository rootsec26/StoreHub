import { convertAmount } from "@/lib/currency";
import type { CartItem } from "@/lib/cart";
import type { CreateTransactionRequestBody, CurrencyCode, ITransactionItemWithNonCatalogPrice } from "@paddle/paddle-node-sdk";

export interface PaddleCheckoutParams {
  vendorId: string;
  vendorAuthCode: string;
  currency: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    productId: string;
  }>;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface PaddleCheckoutResult {
  checkoutUrl: string;
  orderId?: string;
  isSandbox: boolean;
}

export async function createCheckoutSession(params: PaddleCheckoutParams): Promise<PaddleCheckoutResult> {
  const {
    vendorId,
    vendorAuthCode,
    currency,
    items,
    customerEmail,
    customerName,
    customerPhone,
    customerAddress,
    successUrl,
    cancelUrl,
    metadata = {},
  } = params;

  const isSandbox = process.env.NODE_ENV !== "production";

  if (!process.env.PADDLE_API_KEY) {
    console.warn("[paddle] Running in sandbox/mock mode - PADDLE_API_KEY not set");
    const mockOrderId = `pdl_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      checkoutUrl: `${successUrl}?order_id=${mockOrderId}&mock=true`,
      orderId: mockOrderId,
      isSandbox: true,
    };
  }

  try {
    const { Paddle, Environment } = await import("@paddle/paddle-node-sdk");
    
    const paddle = new Paddle(process.env.PADDLE_API_KEY, {
      environment: isSandbox ? Environment.sandbox : Environment.production,
    });

    const currencyCode = currency.toUpperCase() as CurrencyCode;

    const paddleItems: ITransactionItemWithNonCatalogPrice[] = items.map((item) => ({
      price: {
        amount: Math.round(item.unitPrice * 100),
        currency: currencyCode,
      },
      quantity: item.quantity,
    })) as unknown as ITransactionItemWithNonCatalogPrice[];

    const requestBody: CreateTransactionRequestBody & {
      customer?: { email: string; name?: string; locale: string };
    } = {
      items: paddleItems,
      currencyCode,
      customer: customerEmail ? {
        email: customerEmail,
        name: customerName,
        locale: "en",
      } : undefined,
      customData: {
        ...metadata,
        store_currency: currency,
      },
    };

    const transaction = await paddle.transactions.create(requestBody);

    const checkoutUrl = transaction.checkout?.url || `${successUrl}?transaction_id=${transaction.id}`;

    return {
      checkoutUrl,
      orderId: transaction.id,
      isSandbox,
    };
  } catch (error) {
    console.error("[paddle] Failed to create checkout session:", error);
    throw new Error(`Failed to create Paddle checkout session: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): Promise<Record<string, unknown>> {
  if (!process.env.PADDLE_API_KEY) {
    throw new Error("PADDLE_API_KEY is not configured");
  }

  try {
    const { Paddle, Environment } = await import("@paddle/paddle-node-sdk");
    const paddle = new Paddle(process.env.PADDLE_API_KEY, {
      environment: process.env.NODE_ENV === "production" ? Environment.production : Environment.sandbox,
    });

    const event = await paddle.webhooks.unmarshal(payload, webhookSecret, signature);
    return event as unknown as Record<string, unknown>;
  } catch (error) {
    console.error("[paddle] Webhook verification failed:", error);
    throw new Error(`Paddle webhook verification failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
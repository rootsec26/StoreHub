import Stripe from "stripe";
import { loadStripe, Stripe as StripeJS } from "@stripe/stripe-js";
import { convertAmount } from "@/lib/currency";
import type { CartItem } from "@/lib/cart";

export interface StripeCheckoutParams {
  storeId: string;
  stripeAccountId: string;
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

export interface StripeCheckoutResult {
  sessionId: string;
  url: string | null;
  isSandbox: boolean;
}

let stripeInstance: Stripe | null = null;
let stripeJSInstance: Promise<StripeJS | null> | null = null;

function getStripeInstance(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2026-08-26.dahlia" satisfies Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return stripeInstance;
}

function getStripeJSInstance(): Promise<StripeJS | null> {
  if (!stripeJSInstance) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.warn("[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured, Stripe.js will not be available");
      return Promise.resolve(null);
    }
    stripeJSInstance = loadStripe(publishableKey);
  }
  return stripeJSInstance;
}

export async function createCheckoutSession(params: StripeCheckoutParams): Promise<StripeCheckoutResult> {
  const {
    storeId,
    stripeAccountId,
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

  const isSandbox = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("[stripe] Running in sandbox/mock mode - STRIPE_SECRET_KEY not set");
    const mockSessionId = `cs_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      sessionId: mockSessionId,
      url: `${successUrl}?session_id=${mockSessionId}&mock=true`,
      isSandbox: true,
    };
  }

  try {
    const stripe = getStripeInstance();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: Math.round(item.unitPrice * 100),
        product_data: {
          name: item.name,
          metadata: {
            product_id: item.productId,
          },
        },
      },
    }));

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      metadata: {
        store_id: storeId,
        currency,
        ...metadata,
      },
      payment_intent_data: {
        metadata: {
          store_id: storeId,
          currency,
          ...metadata,
        },
      },
      phone_number_collection: {
        enabled: true,
      },
      shipping_address_collection: {
        allowed_countries: ["EG", "SA", "AE", "US", "GB", "DE", "FR", "KW", "QA", "BH", "OM", "JO", "LB", "TR", "IN", "CN", "JP"],
      },
      billing_address_collection: "required",
    };

    if (customerName) {
      sessionParams.metadata = {
        ...sessionParams.metadata,
        customer_name: customerName,
      };
    }

    if (customerPhone) {
      sessionParams.metadata = {
        ...sessionParams.metadata,
        customer_phone: customerPhone,
      };
    }

    if (customerAddress) {
      sessionParams.metadata = {
        ...sessionParams.metadata,
        customer_address: customerAddress,
      };
    }

    if (stripeAccountId) {
      sessionParams.payment_intent_data = {
        ...sessionParams.payment_intent_data,
        application_fee_amount: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 0.02 * 100),
        transfer_data: {
          destination: stripeAccountId,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      stripeAccount: stripeAccountId || undefined,
    });

    return {
      sessionId: session.id,
      url: session.url,
      isSandbox,
    };
  } catch (error) {
    console.error("[stripe] Failed to create checkout session:", error);
    throw new Error(`Failed to create Stripe checkout session: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function createConnectedAccount(params: {
  email: string;
  country: string;
  businessType: "individual" | "company";
  capabilities?: string[];
}): Promise<{ accountId: string; onboardingUrl?: string }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeInstance();

  const account = await stripe.accounts.create({
    type: "express",
    email: params.email,
    country: params.country,
    business_type: params.businessType,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      ...(params.capabilities?.reduce((acc, cap) => ({ ...acc, [cap]: { requested: true } }), {}) || {}),
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings/payments?refresh=true`,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings/payments?success=true`,
    type: "account_onboarding",
  });

  return {
    accountId: account.id,
    onboardingUrl: accountLink.url,
  };
}

export async function getAccountStatus(accountId: string): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: Stripe.Account.Requirements | undefined;
}> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeInstance();
  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  };
}

export async function createPortalSession(accountId: string, returnUrl: string): Promise<string> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeInstance();
  const session = await stripe.billingPortal.sessions.create({
    return_url: returnUrl,
  }, {
    stripeAccount: accountId,
  });

  return session.url;
}

export async function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Promise<Stripe.Event> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeInstance();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export { getStripeInstance, getStripeJSInstance };
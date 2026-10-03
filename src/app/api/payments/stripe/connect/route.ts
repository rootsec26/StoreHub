import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createConnectedAccount, getAccountStatus } from "@/lib/payments/stripe";
import { createErrorResponse } from "@/lib/errors";

const isSandbox = !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe API key is missing in environment variables", code: "STRIPE_KEY_MISSING", isSandbox: true },
        { status: 500 }
      );
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { storeId } = body;

    if (storeId !== userStore[0].id) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const store = userStore[0];

    if (!store.stripeAccountId) {
      const result = await createConnectedAccount({
        email: session.email,
        country: "EG",
        businessType: "individual",
      });

      if (!isSandbox) {
        await db
          .update(stores)
          .set({ stripeAccountId: result.accountId })
          .where(eq(stores.id, store.id));
      }

      return NextResponse.json({
        accountId: result.accountId,
        onboardingUrl: result.onboardingUrl,
        isSandbox,
      });
    } else {
      const status = await getAccountStatus(store.stripeAccountId);
      if (!status.chargesEnabled || !status.payoutsEnabled) {
        const accountLink = await createConnectedAccount({
          email: session.email,
          country: "EG",
          businessType: "individual",
        });
        return NextResponse.json({
          accountId: store.stripeAccountId,
          onboardingUrl: accountLink.onboardingUrl,
          isSandbox,
        });
      }

      return NextResponse.json({
        accountId: store.stripeAccountId,
        onboardingUrl: null,
        isSandbox,
      });
    }
  } catch (error) {
    console.error("Stripe connect error:", error);
    return createErrorResponse(error, "Failed to connect Stripe account");
  }
}
import { NextRequest, NextResponse } from "next/server";

import { createSession, getSessionWithStore } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  PRODUCT_REGISTRY,
  getProductEntryRoute,
  getSafeInternalPath,
  hasProductAccess,
  isProductKey,
  type ProductKey,
} from "@/lib/products";
import {
  activateProduct,
  getUserProductState,
  joinProductWaitlist,
  resolveStorehubLanding,
  setLastUsedProduct,
} from "@/lib/products-server";

/**
 * Aura Hub product access API.
 *
 * GET  → effective per-user product map + lastUsedProduct (for the
 *        dashboard product switcher).
 * POST → { product, action? }
 *        action "enter"    (default): activates trial access when needed,
 *                          records lastUsedProduct and returns the route
 *                          the user should land on.
 *        action "waitlist": records "notify me" interest for coming-soon
 *                          products.
 */
export async function GET() {
  try {
    const session = await getSessionWithStore();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const state = await getUserProductState(session.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error("[hub] GET failed:", error);
    return createErrorResponse(error, "Failed to load products");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithStore();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const payload =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const product = payload?.product;
    const action = payload?.action;

    if (!isProductKey(product)) {
      return NextResponse.json(
        { error: "Unknown product", code: "UNKNOWN_PRODUCT" },
        { status: 400 }
      );
    }
    if (action !== undefined && action !== "enter" && action !== "waitlist") {
      return NextResponse.json(
        { error: "Unknown action", code: "UNKNOWN_ACTION" },
        { status: 400 }
      );
    }

    const key: ProductKey = product;
    const definition = PRODUCT_REGISTRY[key];

    // Waitlist interest is only meaningful for coming-soon products —
    // available products go through "enter" instead.
    if (action === "waitlist") {
      if (definition.status !== "coming_soon") {
        return NextResponse.json(
          { error: "Product is already available", code: "NOT_COMING_SOON" },
          { status: 400 }
        );
      }
      await joinProductWaitlist(session.id, key);
      return NextResponse.json({ success: true, waitlisted: true });
    }

    // Coming-soon products never navigate — the client shows the
    // "Coming soon" state and offers the waitlist action instead.
    if (definition.status === "coming_soon") {
      return NextResponse.json({ comingSoon: true });
    }

    const state = await getUserProductState(session.id);
    if (!hasProductAccess(state.products, key)) {
      await activateProduct(session.id, key);
    }
    await setLastUsedProduct(session.id, key);

    const fresh = await getUserProductState(session.id);
    const entryRoute = getProductEntryRoute(fresh.products, key);
    if (!entryRoute) {
      return NextResponse.json({ comingSoon: true });
    }

    const safeNext = getSafeInternalPath(payload?.next);
    const access = fresh.products[key];
    const onboardingPending = Boolean(access && !access.onboardingCompleted);
    let redirectUrl = entryRoute;
    if (key === "storehub") {
      // Central pay-first rule: unpaid -> /billing, paid without store ->
      // /onboarding, paid with store (owner or member) -> /dashboard.
      const landing = await resolveStorehubLanding(session.id);
      if (landing.route === "/onboarding") {
        redirectUrl = `/onboarding?name=${encodeURIComponent(session.name)}`;
      } else if (landing.route === "/dashboard" && safeNext) {
        redirectUrl = safeNext;
      } else {
        redirectUrl = landing.route;
      }
    } else if (onboardingPending && entryRoute === definition.onboardingRoute) {
      redirectUrl = `${entryRoute}?name=${encodeURIComponent(session.name)}`;
    } else if (safeNext) {
      redirectUrl = safeNext;
    }

    // Re-issue the session with healed store claims so the destination
    // (e.g. /dashboard) passes the proxy on the next request even when the
    // incoming JWT predates the user's store or team membership.
    const token = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: session.storeId,
      storeSlug: session.storeSlug,
      storeName: session.storeName,
      role: session.role,
    });

    const response = NextResponse.json({ success: true, redirectUrl });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("[hub] POST failed:", error);
    return createErrorResponse(error, "Failed to enter product");
  }
}

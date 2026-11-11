import { NextRequest, NextResponse } from "next/server";

import { createSession, getSessionWithStore } from "@/lib/auth";
import { extractDbErrorInfo, createErrorResponse } from "@/lib/errors";
import {
  PRODUCT_REGISTRY,
  getProductEntryRoute,
  getSafeInternalPath,
  hasProductAccess,
  isProductKey,
} from "@/lib/products";
import {
  activateProduct,
  getUserProductState,
  resolveStorehubLanding,
  setLastUsedProduct,
} from "@/lib/products-server";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };
}

/**
 * GET /api/hub/enter?product=<key>&next=<internal path>
 *
 * Single-product shortcut target for /select-product. Re-mints the session
 * cookie with freshly resolved store claims before redirecting, so users
 * whose JWT predates their store (or team membership) don't bounce between
 * /dashboard and /select-product forever.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithStore();
    if (!session) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    const product = request.nextUrl.searchParams.get("product");
    if (!isProductKey(product)) {
      return NextResponse.redirect(new URL("/select-product", request.url));
    }

    const definition = PRODUCT_REGISTRY[product];
    if (definition.status === "coming_soon") {
      return NextResponse.redirect(
        new URL("/select-product?stay=1", request.url)
      );
    }

    const state = await getUserProductState(session.id);
    if (!hasProductAccess(state.products, product)) {
      await activateProduct(session.id, product);
    }
    await setLastUsedProduct(session.id, product);

    const fresh = await getUserProductState(session.id);
    const entryRoute = getProductEntryRoute(fresh.products, product);
    if (!entryRoute) {
      return NextResponse.redirect(new URL("/select-product", request.url));
    }

    const safeNext = getSafeInternalPath(
      request.nextUrl.searchParams.get("next")
    );
    const access = fresh.products[product];
    const onboardingPending = Boolean(access && !access.onboardingCompleted);

    let redirectUrl = entryRoute;
    if (product === "storehub") {
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

    // Re-issue the session with healed store claims so the proxy lets the
    // destination through on the very next request.
    const token = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: session.storeId,
      storeSlug: session.storeSlug,
      storeName: session.storeName,
      role: session.role,
    });

    const response = NextResponse.redirect(new URL(redirectUrl, request.url));
    response.cookies.set("session", token, sessionCookieOptions());
    return response;
  } catch (error) {
    const { code = "", message } = extractDbErrorInfo(error);
    console.error("[hub] enter failed:", { code, message }, error);
    return createErrorResponse(error, "Failed to enter product");
  }
}

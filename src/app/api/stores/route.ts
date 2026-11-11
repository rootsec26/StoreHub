import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse, extractDbErrorInfo } from "@/lib/errors";
import { buildStoreUpdate, readJsonObject } from "@/lib/store-update";
import {
  markProductOnboardingComplete,
  getUserProductState,
  setLastUsedProduct,
} from "@/lib/products-server";

// Check slug availability
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Slug is required", code: "MISSING_SLUG" }, { status: 400 });
    }

    const existing = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    return NextResponse.json({ available: existing.length === 0 });
  } catch (error) {
    console.error("Check slug error:", error);
    return createErrorResponse(error, "Failed to check slug availability");
  }
}

// Create store
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (body instanceof NextResponse) return body;
    const { name, slug, description, category, phone, address } = body;

    if (
      typeof name !== "string" ||
      typeof slug !== "string" ||
      !name ||
      !slug
    ) {
      return NextResponse.json(
        { error: "Name and slug are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be lowercase letters, numbers, and hyphens only", code: "INVALID_SLUG_FORMAT" },
        { status: 400 }
      );
    }

    // Check slug availability
    const existing = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Slug is already taken", code: "DUPLICATE_SLUG" },
        { status: 409 }
      );
    }

    // One store per account — owners and team members alike already have
    // store access resolved from the DB, so block accidental second stores.
    const accessible = await getAccessibleStores(session.id);
    if (accessible.length > 0) {
      return NextResponse.json(
        { error: "You already belong to a store", code: "ALREADY_IN_STORE" },
        { status: 409 }
      );
    }

    // Pay-first: store creation requires an approved StoreHub payment.
    const { products: hubProducts } = await getUserProductState(session.id);
    if (hubProducts.storehub?.status !== "active") {
      return NextResponse.json(
        {
          error: "An active StoreHub subscription is required. Subscribe from Billing.",
          code: "SUBSCRIPTION_REQUIRED",
        },
        { status: 402 }
      );
    }

    const result = await db
      .insert(stores)
      .values({
        ownerId: session.id,
        name,
        slug,
        description: typeof description === "string" ? description : "",
        category: typeof category === "string" ? category : "",
        phone: typeof phone === "string" ? phone : "",
        address: typeof address === "string" ? address : "",
      })
      .returning();

    const store = result[0];

    // Store creation completes StoreHub onboarding in the Aura Hub map.
    // No trial is granted — access requires an approved payment.
    await markProductOnboardingComplete(session.id, "storehub").catch(
      () => undefined
    );
    await setLastUsedProduct(session.id, "storehub").catch(() => undefined);

    // Re-issue the session cookie with the new store so middleware stops
    // bouncing this user back to /onboarding on the next navigation.
    const token = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
      role: "OWNER",
    });

    const response = NextResponse.json({ store });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Create store error:", error);
    const { code = "" } = extractDbErrorInfo(error);
    if (code === "23505") {
      return NextResponse.json(
        { error: "Slug is already taken", code: "DUPLICATE_SLUG" },
        { status: 409 }
      );
    }
    return createErrorResponse(error, "Failed to create store");
  }
}

// Update store
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (body instanceof NextResponse) return body;

    // Get the store the session can access (owner or team admin) — same
    // resolution as GET /api/stores/my so members aren't locked out of saves.
    const userStore = await getAccessibleStores(session.id);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const built = buildStoreUpdate(body, userStore[0]);
    if (built.error) return built.error;

    const result = await db
      .update(stores)
      .set(built.update)
      .where(eq(stores.id, userStore[0].id))
      .returning();

    return NextResponse.json({ store: result[0] });
  } catch (error) {
    console.error("Update store error:", error);
    return createErrorResponse(error, "Failed to update store");
  }
}

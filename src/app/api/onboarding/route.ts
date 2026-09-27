import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { extractDbErrorInfo, createErrorResponse } from "@/lib/errors";

const VALID_CATEGORIES = [
  "retail",
  "electronics",
  "fashion",
  "food",
  "health",
  "home",
  "sports",
  "beauty",
  "automotive",
  "books",
  "other",
];

export async function POST(request: NextRequest) {
  const session = await getSession();

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

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object", code: "INVALID_PAYLOAD" },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const category =
    typeof payload.category === "string" ? payload.category.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const address =
    typeof payload.address === "string" ? payload.address.trim() : "";

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Store name and slug are required", code: "MISSING_FIELDS" },
      { status: 400 }
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      { error: "Store name must be 100 characters or fewer", code: "NAME_TOO_LONG" },
      { status: 400 }
    );
  }

  if (slug.length < 2 || slug.length > 50) {
    return NextResponse.json(
      { error: "Store slug must be between 2 and 50 characters", code: "INVALID_SLUG_LENGTH" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Store slug can only contain lowercase letters, numbers, and hyphens", code: "INVALID_SLUG_FORMAT" },
      { status: 400 }
    );
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: "Invalid category", code: "INVALID_CATEGORY" },
      { status: 400 }
    );
  }

  try {
    // Check if slug is already taken
    const existingSlug = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    if (existingSlug.length > 0) {
      return NextResponse.json(
        { error: "This store slug is already taken", code: "DUPLICATE_SLUG" },
        { status: 409 }
      );
    }

    // Check if user already has a store
    const existingStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    let store;

    if (existingStore.length > 0) {
      // Update existing store
      const result = await db
        .update(stores)
        .set({
          name,
          slug,
          description,
          category,
          phone,
          address,
        })
        .where(eq(stores.id, existingStore[0].id))
        .returning();
      store = result[0];
    } else {
      // Create new store
      const result = await db
        .insert(stores)
        .values({
          ownerId: session.id,
          name,
          slug,
          description,
          category,
          phone,
          address,
        })
        .returning();
      store = result[0];
    }

    // Create new session with store info
    const token = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
    });

    const response = NextResponse.json(
      { success: true, redirectUrl: "/dashboard" },
      { status: 200 }
    );

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    const { code = "", message } = extractDbErrorInfo(error);

    console.error("[onboarding] failed:", { code, message }, error);

    if (code === "23505" || message.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "This store slug is already taken", code: "DUPLICATE_SLUG" },
        { status: 409 }
      );
    }

    return createErrorResponse(error, "Failed to create store");
  }
}
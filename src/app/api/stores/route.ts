import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, getSession } from "@/lib/auth";
import { isHexColor } from "@/lib/theme";

// Check slug availability
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const existing = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, slug))
    .limit(1);

  return NextResponse.json({ available: existing.length === 0 });
}

// Create store
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, description, category, phone, address } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be lowercase letters, numbers, and hyphens only" },
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
        { error: "Slug is already taken" },
        { status: 409 }
      );
    }

    const result = await db
      .insert(stores)
      .values({
        ownerId: session.id,
        name,
        slug,
        description: description || "",
        category: category || "",
        phone: phone || "",
        address: address || "",
      })
      .returning();

    const store = result[0];

    // Re-issue the session cookie with the new store so middleware stops
    // bouncing this user back to /create-store on the next navigation.
    const token = await createSession({
      id: session.id,
      email: session.email,
      name: session.name,
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
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
  } catch (error: any) {
    console.error("Create store error:", error);
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Slug is already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update store
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, category, phone, address, logoUrl, coverUrl, accentColor } = body;

    // Get user's store
    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    if (accentColor !== undefined && accentColor !== "" && !isHexColor(accentColor)) {
      return NextResponse.json(
        { error: "accentColor must be a hex color like #4f46e5" },
        { status: 400 }
      );
    }

    const result = await db
      .update(stores)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(coverUrl !== undefined && { coverUrl }),
        ...(accentColor !== undefined && { accentColor }),
      })
      .where(eq(stores.id, userStore[0].id))
      .returning();

    return NextResponse.json({ store: result[0] });
  } catch (error) {
    console.error("Update store error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

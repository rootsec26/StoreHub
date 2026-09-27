import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories, stores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

// Get categories
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const slug = request.nextUrl.searchParams.get("slug");

    if (slug) {
      // Public: get categories by store slug
      const storeResult = await db
        .select()
        .from(stores)
        .where(eq(stores.slug, slug))
        .limit(1);

      if (storeResult.length === 0) {
        return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
      }

      const result = await db
        .select()
        .from(categories)
        .where(eq(categories.storeId, storeResult[0].id));

      return NextResponse.json({ categories: result });
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    // Dashboard: get categories for user's store
    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const result = await db
      .select()
      .from(categories)
      .where(eq(categories.storeId, userStore[0].id));

    return NextResponse.json({ categories: result });
  } catch (error) {
    console.error("Get categories error:", error);
    return createErrorResponse(error, "Failed to fetch categories");
  }
}

// Create category
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required", code: "MISSING_NAME" },
        { status: 400 }
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

    const result = await db
      .insert(categories)
      .values({
        storeId: userStore[0].id,
        name,
      })
      .returning();

    return NextResponse.json({ category: result[0] });
  } catch (error) {
    console.error("Create category error:", error);
    return createErrorResponse(error, "Failed to create category");
  }
}

// Delete category
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found", code: "STORE_NOT_FOUND" }, { status: 404 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Category ID is required", code: "MISSING_ID" }, { status: 400 });
    }

    const result = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.storeId, userStore[0].id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Forbidden: Category not found in your store", code: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category error:", error);
    return createErrorResponse(error, "Failed to delete category");
  }
}

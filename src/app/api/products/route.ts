import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, stores } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizePlan, productLimitFor } from "@/lib/plans";

// Get products for store
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const storeId = request.nextUrl.searchParams.get("storeId");
    const slug = request.nextUrl.searchParams.get("slug");
    const onlyVisible = request.nextUrl.searchParams.get("visible") === "true";

    if (slug) {
      // Public: get products by store slug
      const storeResult = await db
        .select()
        .from(stores)
        .where(eq(stores.slug, slug))
        .limit(1);

      if (storeResult.length === 0) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }

      const conditions = [eq(products.storeId, storeResult[0].id)];
      if (onlyVisible) {
        conditions.push(eq(products.isVisible, true));
      }

      const result = await db
        .select()
        .from(products)
        .where(and(...conditions));

      return NextResponse.json({ products: result, store: storeResult[0] });
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Dashboard: get products for user's store
    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const result = await db
      .select()
      .from(products)
      .where(eq(products.storeId, userStore[0].id));

    return NextResponse.json({ products: result });
  } catch (error) {
    console.error("Get products error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create product
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, price, stock, categoryId, imageUrl, isVisible } = body;

    if (!name || price === undefined) {
      return NextResponse.json(
        { error: "Name and price are required" },
        { status: 400 }
      );
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Plan limit guard: Free = max 15 products, Pro = unlimited.
    const plan = normalizePlan(userStore[0].plan);
    const limit = productLimitFor(plan);

    if (limit !== null) {
      const used = await db
        .select({ value: count() })
        .from(products)
        .where(eq(products.storeId, userStore[0].id));

      const productCount = Number(used[0]?.value ?? 0);
      if (productCount >= limit) {
        return NextResponse.json(
          {
            error: "Product limit reached",
            code: "PRODUCT_LIMIT_REACHED",
            plan,
            limit,
            productCount,
          },
          { status: 402 }
        );
      }
    }

    const result = await db
      .insert(products)
      .values({
        storeId: userStore[0].id,
        name,
        description: description || "",
        price: String(price),
        stock: stock || 0,
        categoryId: categoryId || null,
        imageUrl: imageUrl || "",
        isVisible: isVisible !== undefined ? isVisible : true,
      })
      .returning();

    return NextResponse.json({ product: result[0] });
  } catch (error) {
    console.error("Create product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update product
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, price, stock, categoryId, imageUrl, isVisible } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const result = await db
      .update(products)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: String(price) }),
        ...(stock !== undefined && { stock }),
        ...(categoryId !== undefined && { categoryId }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isVisible !== undefined && { isVisible }),
      })
      .where(eq(products.id, id))
      .returning();

    return NextResponse.json({ product: result[0] });
  } catch (error) {
    console.error("Update product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Delete product
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    await db.delete(products).where(eq(products.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete product error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

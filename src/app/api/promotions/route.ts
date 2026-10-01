import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { promotions, stores } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { promotionState, type PromotionRecord } from "@/lib/promotions";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id, slug: stores.slug })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function toRecord(row: typeof promotions.$inferSelect): PromotionRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    title: row.title,
    discountPercentage: row.discountPercentage,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    isActive: row.isActive,
    bannerText: row.bannerText,
    showBanner: row.showBanner,
    targetProductIds: row.targetProductIds ?? [],
    targetCategoryIds: row.targetCategoryIds ?? [],
  };
}

// Get promotions (public by slug, or the owner's full list + summary)
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");
    const now = new Date();

    if (slug) {
      // Public storefront: live or upcoming campaigns for this store.
      const storeResult = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.slug, slug))
        .limit(1);

      if (storeResult.length === 0) {
        return NextResponse.json(
          { error: "Store not found", code: "STORE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const result = await db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.storeId, storeResult[0].id),
            eq(promotions.isActive, true),
            gt(promotions.endTime, now)
          )
        )
        .orderBy(asc(promotions.startTime));

      return NextResponse.json({ promotions: result.map(toRecord) });
    }

    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const result = await db
      .select()
      .from(promotions)
      .where(eq(promotions.storeId, store.id))
      .orderBy(asc(promotions.startTime));

    const records = result.map(toRecord);
    const timestamp = Date.now();
    const activeCount = records.filter(
      (record) => promotionState(record, timestamp) === "live"
    ).length;

    return NextResponse.json({ promotions: records, activeCount });
  } catch (error) {
    console.error("Get promotions error:", error);
    return createErrorResponse(error, "Failed to fetch promotions");
  }
}

// Create a flash sale
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      title,
      discountPercentage,
      startTime,
      endTime,
      bannerText,
      showBanner,
      targetProductIds,
      targetCategoryIds,
      isActive,
    } = body ?? {};

    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const discount = Number(discountPercentage);
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!trimmedTitle) {
      return NextResponse.json(
        { error: "Title is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(discount) || discount < 1 || discount > 100) {
      return NextResponse.json(
        { error: "Discount must be between 1 and 100", code: "INVALID_DISCOUNT" },
        { status: 400 }
      );
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Start and end date-times are required", code: "INVALID_DATES" },
        { status: 400 }
      );
    }
    if (end.getTime() <= start.getTime()) {
      return NextResponse.json(
        { error: "End time must be after start time", code: "INVALID_DATES" },
        { status: 400 }
      );
    }

    const result = await db
      .insert(promotions)
      .values({
        storeId: store.id,
        title: trimmedTitle,
        discountPercentage: Math.round(discount),
        startTime: start,
        endTime: end,
        isActive: isActive !== false,
        bannerText: typeof bannerText === "string" ? bannerText.trim() : "",
        showBanner: showBanner !== false,
        targetProductIds: Array.isArray(targetProductIds)
          ? targetProductIds.filter((id: unknown) => typeof id === "string")
          : [],
        targetCategoryIds: Array.isArray(targetCategoryIds)
          ? targetCategoryIds.filter((id: unknown) => typeof id === "string")
          : [],
      })
      .returning();

    return NextResponse.json({ promotion: toRecord(result[0]) });
  } catch (error) {
    console.error("Create promotion error:", error);
    return createErrorResponse(error, "Failed to create promotion");
  }
}

// Update a flash sale (toggle, reschedule, re-target)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { id, ...patch } = body ?? {};
    if (!id) {
      return NextResponse.json(
        { error: "Promotion ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const values: Partial<typeof promotions.$inferInsert> = {};
    if (patch.title !== undefined) values.title = String(patch.title).trim();
    if (patch.discountPercentage !== undefined) {
      const discount = Number(patch.discountPercentage);
      if (!Number.isFinite(discount) || discount < 1 || discount > 100) {
        return NextResponse.json(
          { error: "Discount must be between 1 and 100", code: "INVALID_DISCOUNT" },
          { status: 400 }
        );
      }
      values.discountPercentage = Math.round(discount);
    }
    if (patch.startTime !== undefined) {
      const start = new Date(patch.startTime);
      if (Number.isNaN(start.getTime())) {
        return NextResponse.json(
          { error: "Invalid start time", code: "INVALID_DATES" },
          { status: 400 }
        );
      }
      values.startTime = start;
    }
    if (patch.endTime !== undefined) {
      const end = new Date(patch.endTime);
      if (Number.isNaN(end.getTime())) {
        return NextResponse.json(
          { error: "Invalid end time", code: "INVALID_DATES" },
          { status: 400 }
        );
      }
      values.endTime = end;
    }
    if (patch.bannerText !== undefined) {
      values.bannerText = String(patch.bannerText ?? "");
    }
    if (patch.showBanner !== undefined) {
      values.showBanner = Boolean(patch.showBanner);
    }
    if (patch.isActive !== undefined) {
      values.isActive = Boolean(patch.isActive);
    }
    if (Array.isArray(patch.targetProductIds)) {
      values.targetProductIds = patch.targetProductIds.filter(
        (entry: unknown) => typeof entry === "string"
      );
    }
    if (Array.isArray(patch.targetCategoryIds)) {
      values.targetCategoryIds = patch.targetCategoryIds.filter(
        (entry: unknown) => typeof entry === "string"
      );
    }

    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { error: "No fields to update", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const result = await db
      .update(promotions)
      .set(values)
      .where(and(eq(promotions.id, id), eq(promotions.storeId, store.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Promotion not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ promotion: toRecord(result[0]) });
  } catch (error) {
    console.error("Update promotion error:", error);
    return createErrorResponse(error, "Failed to update promotion");
  }
}

// Delete a flash sale
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Promotion ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const result = await db
      .delete(promotions)
      .where(and(eq(promotions.id, id), eq(promotions.storeId, store.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Promotion not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete promotion error:", error);
    return createErrorResponse(error, "Failed to delete promotion");
  }
}

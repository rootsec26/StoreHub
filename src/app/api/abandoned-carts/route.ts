import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { abandonedCarts, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  computeAbandonedSummary,
  isAbandonedCartStatus,
  type AbandonedCartRecord,
} from "@/lib/abandoned-carts";

export const runtime = "nodejs";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id, slug: stores.slug })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function toRecord(row: typeof abandonedCarts.$inferSelect): AbandonedCartRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    customerName: row.customerName ?? "",
    customerPhone: row.customerPhone ?? "",
    customerEmail: row.customerEmail ?? "",
    cartItems: row.cartItems ?? [],
    totalAmount: String(row.totalAmount ?? "0"),
    status: isAbandonedCartStatus(row.status) ? row.status : "pending",
    recoveryToken: row.recoveryToken,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Owner dashboard payload: abandoned cart snapshots + recovery metrics.
 * `?summary=1` returns only the metrics (used by the sidebar badge).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const rows = await db
      .select()
      .from(abandonedCarts)
      .where(eq(abandonedCarts.storeId, store.id))
      .orderBy(desc(abandonedCarts.createdAt));

    const records = rows.map(toRecord);
    const summary = computeAbandonedSummary(records);

    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ summary });
    }

    return NextResponse.json({
      carts: records,
      summary,
      storeSlug: store.slug,
    });
  } catch (error) {
    console.error("Get abandoned carts error:", error);
    return createErrorResponse(error, "Failed to fetch abandoned carts");
  }
}

// Manual status toggle: Recovered / Dismissed / Pending / Expired
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const store = await getOwnedStore(session.id);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;

    if (!id) {
      return NextResponse.json(
        { error: "Cart id is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    if (!isAbandonedCartStatus(status)) {
      return NextResponse.json(
        { error: "Invalid status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(abandonedCarts)
      .set({ status })
      .where(and(eq(abandonedCarts.id, id), eq(abandonedCarts.storeId, store.id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        {
          error: "Forbidden: cart not found in your store",
          code: "FORBIDDEN",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, cart: toRecord(updated[0]) });
  } catch (error) {
    console.error("Update abandoned cart error:", error);
    return createErrorResponse(error, "Failed to update abandoned cart");
  }
}

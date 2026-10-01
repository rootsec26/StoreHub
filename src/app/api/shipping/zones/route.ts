import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { shippingZones, stores } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import type { ShippingZoneRecord } from "@/lib/shipping";

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

function toRecord(row: typeof shippingZones.$inferSelect): ShippingZoneRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    zoneName: row.zoneName,
    rate: String(row.rate),
    estimatedDeliveryDays: row.estimatedDeliveryDays,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseRate(value: unknown): number | null {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100000) return null;
  return Math.round(rate * 100) / 100;
}

function parseDays(value: unknown, fallback = 2): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const days = Number(value);
  if (!Number.isFinite(days) || days < 1 || days > 90) return null;
  return Math.round(days);
}

// List delivery zones for the signed-in store
export async function GET() {
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

    const result = await db
      .select()
      .from(shippingZones)
      .where(eq(shippingZones.storeId, store.id))
      .orderBy(asc(shippingZones.rate));

    return NextResponse.json({ zones: result.map(toRecord) });
  } catch (error) {
    console.error("Get shipping zones error:", error);
    return createErrorResponse(error, "Failed to fetch shipping zones");
  }
}

// Create a delivery zone
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
    const zoneName = typeof body?.zoneName === "string" ? body.zoneName.trim() : "";
    const rate = parseRate(body?.rate);
    const days = parseDays(body?.estimatedDeliveryDays);

    if (!zoneName) {
      return NextResponse.json(
        { error: "Zone name is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (rate === null) {
      return NextResponse.json(
        { error: "Rate must be a positive number", code: "INVALID_RATE" },
        { status: 400 }
      );
    }
    if (days === null) {
      return NextResponse.json(
        { error: "Estimated delivery days must be between 1 and 90", code: "INVALID_DAYS" },
        { status: 400 }
      );
    }

    const result = await db
      .insert(shippingZones)
      .values({
        storeId: store.id,
        zoneName,
        rate: String(rate.toFixed(2)),
        estimatedDeliveryDays: days,
        isActive: body?.isActive !== false,
      })
      .returning();

    return NextResponse.json({ zone: toRecord(result[0]) });
  } catch (error) {
    console.error("Create shipping zone error:", error);
    return createErrorResponse(error, "Failed to create shipping zone");
  }
}

// Update a delivery zone (rename, re-rate, pause)
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
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json(
        { error: "Zone ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const values: Partial<typeof shippingZones.$inferInsert> = {};

    if (body?.zoneName !== undefined) {
      const zoneName = String(body.zoneName).trim();
      if (!zoneName) {
        return NextResponse.json(
          { error: "Zone name is required", code: "MISSING_FIELDS" },
          { status: 400 }
        );
      }
      values.zoneName = zoneName;
    }
    if (body?.rate !== undefined) {
      const rate = parseRate(body.rate);
      if (rate === null) {
        return NextResponse.json(
          { error: "Rate must be a positive number", code: "INVALID_RATE" },
          { status: 400 }
        );
      }
      values.rate = String(rate.toFixed(2));
    }
    if (body?.estimatedDeliveryDays !== undefined) {
      const days = parseDays(body.estimatedDeliveryDays);
      if (days === null) {
        return NextResponse.json(
          { error: "Estimated delivery days must be between 1 and 90", code: "INVALID_DAYS" },
          { status: 400 }
        );
      }
      values.estimatedDeliveryDays = days;
    }
    if (body?.isActive !== undefined) {
      values.isActive = Boolean(body.isActive);
    }

    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { error: "No fields to update", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    const result = await db
      .update(shippingZones)
      .set(values)
      .where(and(eq(shippingZones.id, id), eq(shippingZones.storeId, store.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Zone not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ zone: toRecord(result[0]) });
  } catch (error) {
    console.error("Update shipping zone error:", error);
    return createErrorResponse(error, "Failed to update shipping zone");
  }
}

// Delete a delivery zone
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
        { error: "Zone ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const result = await db
      .delete(shippingZones)
      .where(and(eq(shippingZones.id, id), eq(shippingZones.storeId, store.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Zone not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete shipping zone error:", error);
    return createErrorResponse(error, "Failed to delete shipping zone");
  }
}

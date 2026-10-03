import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { shippingIntegrations, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { formatZodError, validateRequest } from "@/lib/validators";
import {
  CARRIER_PROFILES,
  isShippingCarrier,
} from "@/lib/shipping";
import { encryptSecret, maskSecret } from "@/lib/shipping-crypto";

const MAX_INTEGRATIONS_PER_STORE = 10;

const governorateList = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((list) => [...new Set(list.map((entry) => entry.trim()))]);

const integrationCreateSchema = z.object({
  carrier: z.string().trim().min(1),
  apiKey: z.string().trim().max(500).optional(),
  apiSecret: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
  defaultForGovernorates: governorateList.optional(),
});

const integrationUpdateSchema = integrationCreateSchema.partial().extend({
  id: z.string().trim().min(1),
});

type IntegrationRow = typeof shippingIntegrations.$inferSelect;

function serialize(row: IntegrationRow) {
  return {
    id: row.id,
    carrier: row.carrier,
    carrierLabel: isShippingCarrier(row.carrier)
      ? CARRIER_PROFILES[row.carrier].label
      : row.carrier,
    isActive: row.isActive,
    defaultForGovernorates: row.defaultForGovernorates ?? [],
    hasApiKey: Boolean(row.apiKey),
    hasApiSecret: Boolean(row.apiSecret),
    apiKeyMasked: maskSecret(row.apiKey),
    apiSecretMasked: maskSecret(row.apiSecret),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getOwnedStore(sessionId: string) {
  const userStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, sessionId))
    .limit(1);
  return userStore[0];
}

/** Lists the store's carrier accounts (secrets always masked). */
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

    const rows = await db
      .select()
      .from(shippingIntegrations)
      .where(eq(shippingIntegrations.storeId, store.id))
      .orderBy(asc(shippingIntegrations.createdAt));

    return NextResponse.json({ integrations: rows.map(serialize) });
  } catch (error) {
    console.error("List shipping integrations error:", error);
    return createErrorResponse(error, "Failed to fetch carrier integrations");
  }
}

/** Connects a new carrier account. */
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

    const body = await request.json().catch(() => null);
    const validation = validateRequest(integrationCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }
    const payload = validation.data;

    if (!isShippingCarrier(payload.carrier)) {
      return NextResponse.json(
        { error: "Unsupported carrier", code: "INVALID_CARRIER" },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ id: shippingIntegrations.id })
      .from(shippingIntegrations)
      .where(eq(shippingIntegrations.storeId, store.id));
    if (existing.length >= MAX_INTEGRATIONS_PER_STORE) {
      return NextResponse.json(
        { error: "Carrier connection limit reached", code: "TOO_MANY" },
        { status: 400 }
      );
    }

    const inserted = await db
      .insert(shippingIntegrations)
      .values({
        storeId: store.id,
        carrier: payload.carrier,
        apiKey: encryptSecret(payload.apiKey ?? ""),
        apiSecret: encryptSecret(payload.apiSecret ?? ""),
        isActive: payload.isActive ?? true,
        defaultForGovernorates: payload.defaultForGovernorates ?? [],
      })
      .returning();

    return NextResponse.json({ integration: serialize(inserted[0]) });
  } catch (error) {
    console.error("Create shipping integration error:", error);
    return createErrorResponse(error, "Failed to connect carrier");
  }
}

/** Updates credentials / active flag / default governorates. */
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

    const body = await request.json().catch(() => null);
    const validation = validateRequest(integrationUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error), code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }
    const payload = validation.data;

    const values: Partial<IntegrationRow> = { updatedAt: new Date() };
    if (payload.carrier !== undefined) {
      if (!isShippingCarrier(payload.carrier)) {
        return NextResponse.json(
          { error: "Unsupported carrier", code: "INVALID_CARRIER" },
          { status: 400 }
        );
      }
      values.carrier = payload.carrier;
    }
    if (payload.apiKey !== undefined) values.apiKey = encryptSecret(payload.apiKey);
    if (payload.apiSecret !== undefined) values.apiSecret = encryptSecret(payload.apiSecret);
    if (payload.isActive !== undefined) values.isActive = payload.isActive;
    if (payload.defaultForGovernorates !== undefined) {
      values.defaultForGovernorates = payload.defaultForGovernorates;
    }

    const updated = await db
      .update(shippingIntegrations)
      .set(values)
      .where(
        and(
          eq(shippingIntegrations.id, payload.id),
          eq(shippingIntegrations.storeId, store.id)
        )
      )
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Integration not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ integration: serialize(updated[0]) });
  } catch (error) {
    console.error("Update shipping integration error:", error);
    return createErrorResponse(error, "Failed to update carrier integration");
  }
}

/** DELETE /api/shipping/integrations?id=… — disconnects a carrier. */
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

    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) {
      return NextResponse.json(
        { error: "Integration ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(shippingIntegrations)
      .where(
        and(
          eq(shippingIntegrations.id, id),
          eq(shippingIntegrations.storeId, store.id)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Integration not found in your store", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete shipping integration error:", error);
    return createErrorResponse(error, "Failed to disconnect carrier");
  }
}

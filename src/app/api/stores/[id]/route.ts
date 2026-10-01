import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";
import { buildStoreUpdate, readJsonObject, type StoreRow } from "@/lib/store-update";

interface StoreContext {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Store not found", code: "STORE_NOT_FOUND" },
    { status: 404 }
  );
}

async function loadOwnedStore(
  id: string
): Promise<{ store: StoreRow } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  if (!UUID_PATTERN.test(id)) return { response: notFoundResponse() };

  const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  const store = rows[0];
  if (!store || store.ownerId !== session.id) return { response: notFoundResponse() };

  return { store };
}

// Fetch a single store owned by the current user
export async function GET(_request: NextRequest, { params }: StoreContext) {
  try {
    const { id } = await params;
    const result = await loadOwnedStore(id);
    if ("response" in result) return result.response;

    return NextResponse.json({
      store: {
        ...result.store,
        themeConfig: result.store.themeConfig ?? DEFAULT_THEME_CONFIG,
      },
    });
  } catch (error) {
    console.error("Fetch store error:", error);
    return createErrorResponse(error, "Failed to fetch store");
  }
}

// Update a single store (including its theme config)
export async function PATCH(request: NextRequest, { params }: StoreContext) {
  try {
    const { id } = await params;
    const result = await loadOwnedStore(id);
    if ("response" in result) return result.response;
    const store = result.store;

    const body = await readJsonObject(request);
    if (body instanceof NextResponse) return body;

    const built = buildStoreUpdate(body, store);
    if (built.error) return built.error;

    const updated = await db
      .update(stores)
      .set(built.update)
      .where(eq(stores.id, store.id))
      .returning();

    return NextResponse.json({ store: updated[0] });
  } catch (error) {
    console.error("Update store error:", error);
    return createErrorResponse(error, "Failed to update store");
  }
}

export async function PUT(request: NextRequest, context: StoreContext) {
  return PATCH(request, context);
}

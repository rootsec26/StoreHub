import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession, resolveStoreAccess } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { hasFeatureAccess } from "@/lib/paywall";
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

async function loadAccessibleStore(
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

  // Resolve through store_members as well so team admins can load and update
  // the store they manage — matching /api/stores/my and the other dashboard
  // APIs. A session can only ever reach its own accessible store.
  const access = await resolveStoreAccess(session.id);
  if (!access || access.store.id !== id) return { response: notFoundResponse() };

  return { store: access.store };
}

// Fetch a single store accessible to the current user (owner or team admin)
export async function GET(_request: NextRequest, { params }: StoreContext) {
  try {
    const { id } = await params;
    const result = await loadAccessibleStore(id);
    if ("response" in result) return result.response;

    return NextResponse.json({
      store: {
        ...result.store,
        // White-label is a paid entitlement; report what is actually active.
        hasWhiteLabel: await hasFeatureAccess(result.store.id, "white_label"),
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
    const result = await loadAccessibleStore(id);
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

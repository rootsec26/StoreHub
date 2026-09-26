import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { products, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { normalizePlan, productLimitFor, isPlan } from "@/lib/plans";
import type { BillingInfo } from "@/lib/types";

export const runtime = "nodejs";

async function buildBillingInfo(ownerId: string): Promise<BillingInfo | null> {
  const store = await db
    .select({
      id: stores.id,
      name: stores.name,
      plan: stores.plan,
    })
    .from(stores)
    .where(eq(stores.ownerId, ownerId))
    .limit(1);

  if (store.length === 0) return null;

  const plan = normalizePlan(store[0].plan);
  const limit = productLimitFor(plan);

  const productCount = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.storeId, store[0].id));

  const used = Number(productCount[0]?.value ?? 0);

  return {
    plan,
    productCount: used,
    productLimit: limit,
    usagePercent:
      limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    storeId: store[0].id,
    storeName: store[0].name,
  };
}

// Current subscription + product usage for the signed-in store
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const info = await buildBillingInfo(session.id);
    if (!info) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json(info);
  } catch (error) {
    console.error("Get billing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Change subscription tier (mock billing: no payment provider attached)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!isPlan(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (store.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    await db.update(stores).set({ plan }).where(eq(stores.id, store[0].id));

    const info = await buildBillingInfo(session.id);
    return NextResponse.json(info);
  } catch (error) {
    console.error("Update plan error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

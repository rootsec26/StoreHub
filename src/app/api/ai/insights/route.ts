import { NextRequest, NextResponse } from "next/server";

import { generateBusinessInsights } from "@/lib/ai";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

interface ProductStatInput {
  name: string;
  quantity: number;
  revenue: string;
}

function toCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(Math.floor(numeric), 1_000_000);
}

function toAmount(value: unknown): string {
  if (typeof value === "number") return value.toFixed(2);
  if (typeof value === "string") {
    const numeric = parseFloat(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
  }
  return "0.00";
}

function toProductStat(value: unknown): ProductStatInput | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 120) : "";
  if (!name) return null;
  return {
    name,
    quantity: toCount(record.quantity),
    revenue: toAmount(record.revenue),
  };
}

/**
 * POST /api/ai/insights
 * Turns the merchant's store analytics snapshot into 3 actionable Arabic
 * business recommendations.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const rawTopProducts: unknown[] = Array.isArray(body.topProducts)
      ? body.topProducts
      : [];
    const topProducts = rawTopProducts
      .map(toProductStat)
      .filter((product): product is ProductStatInput => product !== null)
      .slice(0, 5);

    const result = await generateBusinessInsights({
      totalOrders: toCount(body.totalOrders),
      totalRevenue: toAmount(body.totalRevenue),
      avgOrderValue: toAmount(body.avgOrderValue),
      topProducts,
    });

    return NextResponse.json({
      insights: result.insights,
      source: result.source,
    });
  } catch (error) {
    console.error("AI insights error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

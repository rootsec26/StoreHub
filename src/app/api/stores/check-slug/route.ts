import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slug = searchParams.get("slug");

  if (!slug || slug.length < 2) {
    return NextResponse.json({ available: true });
  }

  try {
    const existing = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);

    return NextResponse.json({ available: existing.length === 0 });
  } catch (error) {
    console.error("Check slug error:", error);
    return createErrorResponse(error, "Failed to check slug");
  }
}
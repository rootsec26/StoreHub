import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { buildAwbLabel, fetchAwbContext } from "@/lib/shipping-awb";
import { createAwbPdf, mergePdfs } from "@/lib/shipping-pdf";

const MAX_LABELS = 100;

/**
 * GET /api/shipping/awb?orderIds=id1,id2,...
 * Merges every requested airway bill into a single printable bulk PDF.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);
    const store = userStore[0];
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const raw = request.nextUrl.searchParams.get("orderIds") || "";
    const orderIds = [
      ...new Set(
        raw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      ),
    ];

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds query parameter is required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }
    if (orderIds.length > MAX_LABELS) {
      return NextResponse.json(
        { error: `Bulk labels are limited to ${MAX_LABELS} orders`, code: "TOO_MANY" },
        { status: 400 }
      );
    }

    const documents: Uint8Array[] = [];
    for (const orderId of orderIds) {
      const context = await fetchAwbContext(store.id, orderId);
      if (!context) continue;
      documents.push(await createAwbPdf(buildAwbLabel(context)));
    }

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No matching orders found in your store", code: "ORDER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const merged =
      documents.length === 1 ? documents[0] : await mergePdfs(documents);

    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bulk-airway-bills-${documents.length}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Merge AWB PDFs error:", error);
    return createErrorResponse(error, "Failed to merge airway bills");
  }
}

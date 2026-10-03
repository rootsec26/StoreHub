import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { buildAwbLabel, fetchAwbContext } from "@/lib/shipping-awb";
import { createAwbPdf } from "@/lib/shipping-pdf";

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

/**
 * GET /api/shipping/awb/[orderId]
 * Renders the printable 4×6 airway bill PDF for one fulfilled order.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await params;
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

    const context = await fetchAwbContext(store.id, orderId);
    if (!context) {
      return NextResponse.json(
        { error: "Order not found in your store", code: "FORBIDDEN" },
        { status: 404 }
      );
    }

    const pdf = await createAwbPdf(buildAwbLabel(context));
    const filename = `awb-${context.order.trackingNumber || context.order.id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Generate AWB error:", error);
    return createErrorResponse(error, "Failed to generate airway bill");
  }
}

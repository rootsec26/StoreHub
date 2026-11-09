import { NextRequest, NextResponse } from "next/server";

import { listAdminCustomerOrders } from "@/lib/admin-customers";
import { isValidUuid } from "@/lib/storefront";
import {
  denyAdmin,
  errorResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/admin/customers/orders?storeId=&phone= — purchase history for one buyer. */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const storeId = params.get("storeId") ?? "";
    const phone = params.get("phone") ?? "";

    if (!isValidUuid(storeId) || !phone.trim()) {
      return NextResponse.json(
        { error: "storeId and phone are required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const orders = await listAdminCustomerOrders({ storeId, phone });
    return NextResponse.json({ orders });
  } catch (error) {
    return errorResponse(error);
  }
}

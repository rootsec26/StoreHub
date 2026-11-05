import { NextRequest, NextResponse } from "next/server";

import { listSelectableCustomers } from "@/lib/messaging/service";
import {
  errorResponse,
  requireMerchantContext,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/notifications/audience/customers — picker for SELECTED_CUSTOMERS. */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireMerchantContext();
    const search = request.nextUrl.searchParams.get("q")?.trim() || undefined;
    const customers = await listSelectableCustomers(storeId, search);
    return NextResponse.json({ customers });
  } catch (error) {
    return errorResponse(error);
  }
}

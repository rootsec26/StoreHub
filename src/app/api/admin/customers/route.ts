import { NextRequest, NextResponse } from "next/server";

import { listAdminCustomers } from "@/lib/admin-customers";
import { isValidUuid } from "@/lib/storefront";
import {
  denyAdmin,
  errorResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

/** GET /api/admin/customers — buyers aggregated from orders across all stores. */
export async function GET(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25) || 25));
    const storeId = params.get("storeId") ?? undefined;
    const q = params.get("q")?.trim() || undefined;

    if (storeId && !isValidUuid(storeId)) {
      return NextResponse.json({ error: "Invalid storeId", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const result = await listAdminCustomers({ q, storeId, page, limit });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

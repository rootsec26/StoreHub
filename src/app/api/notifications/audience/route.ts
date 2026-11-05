import { NextRequest, NextResponse } from "next/server";

import {
  audienceQuerySchema,
  parseCsvIds,
} from "@/lib/messaging/schemas";
import { getAudiencePreview } from "@/lib/messaging/service";
import {
  errorResponse,
  requireMerchantContext,
  validationResponse,
} from "@/lib/messaging/server";

export const runtime = "nodejs";

const CUSTOMER_AUDIENCES = new Set([
  "ALL_CUSTOMERS",
  "SELECTED_CUSTOMERS",
  "CUSTOMER_SEGMENT",
]);

/** GET /api/notifications/audience — recipient count + credit estimate. */
export async function GET(request: NextRequest) {
  try {
    const { storeId } = await requireMerchantContext();
    const params = request.nextUrl.searchParams;

    const parsed = audienceQuerySchema.safeParse({
      audienceType: params.get("audienceType") ?? undefined,
      customerIds: params.get("customerIds") ?? undefined,
      merchantIds: params.get("merchantIds") ?? undefined,
      minSpend: params.get("minSpend") ?? undefined,
      vipTierId: params.get("vipTierId") ?? undefined,
      lastOrderDays: params.get("lastOrderDays") ?? undefined,
      loyaltyPoints: params.get("loyaltyPoints") ?? undefined,
      plan: params.get("plan") ?? undefined,
    });
    if (!parsed.success) return validationResponse(parsed.error);

    if (!CUSTOMER_AUDIENCES.has(parsed.data.audienceType)) {
      return NextResponse.json(
        {
          error: "This endpoint previews customer audiences only.",
          code: "INVALID_AUDIENCE",
        },
        { status: 400 }
      );
    }

    const preview = await getAudiencePreview(
      storeId,
      parsed.data.audienceType,
      {
        customerIds: parseCsvIds(parsed.data.customerIds),
        merchantIds: parseCsvIds(parsed.data.merchantIds),
        minSpend: parsed.data.minSpend,
        vipTierId: parsed.data.vipTierId,
        lastOrderDays: parsed.data.lastOrderDays,
        loyaltyPoints: parsed.data.loyaltyPoints,
        plan: parsed.data.plan,
      }
    );

    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}

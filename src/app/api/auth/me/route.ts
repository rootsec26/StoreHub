import { NextResponse } from "next/server";
import { getSessionWithStore } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";
import { getUserProductState } from "@/lib/products-server";

export async function GET() {
  try {
    const session = await getSessionWithStore();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    // Effective StoreHub subscription state (evaluated: trial/active/expired).
    const { products } = await getUserProductState(session.id);

    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        name: session.name,
      },
      store: session.storeId
        ? {
            id: session.storeId,
            name: session.storeName,
            slug: session.storeSlug,
          }
        : null,
      isAdmin: isAdminEmail(session.email),
      subscription: {
        storehub: products.storehub ?? null,
      },
    });
  } catch (error) {
    console.error("Get session error:", error);
    return createErrorResponse(error, "Failed to get session");
  }
}

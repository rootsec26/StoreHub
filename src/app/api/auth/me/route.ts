import { NextResponse } from "next/server";
import { getSessionWithStore } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const session = await getSessionWithStore();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

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
    });
  } catch (error) {
    console.error("Get session error:", error);
    return createErrorResponse(error, "Failed to get session");
  }
}

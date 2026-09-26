import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  isSupabaseTokenConfigured,
  mintSupabaseAccessToken,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const TTL_SECONDS = 3600;

/**
 * Issues a short-lived Supabase JWT for the signed-in tenant.
 * Used by the browser to upload to Storage and subscribe to Realtime while
 * staying subject to row/policy level security.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSupabaseTokenConfigured()) {
      return NextResponse.json(
        {
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET.",
          configured: false,
        },
        { status: 503 }
      );
    }

    const token = await mintSupabaseAccessToken(session.id, TTL_SECONDS);
    if (!token) {
      return NextResponse.json(
        { error: "Unable to mint Supabase token", configured: false },
        { status: 503 }
      );
    }

    return NextResponse.json({ token, expiresIn: TTL_SECONDS, configured: true });
  } catch (error) {
    console.error("Supabase token error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

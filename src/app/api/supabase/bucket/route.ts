import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";
import { cleanUrlInput, ensureProtocol, safeParseUrl, urlToString } from "@/lib/url";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

// Must match STORAGE_BUCKET in src/lib/storage.ts (kept local: that module is
// client-only and cannot be imported from a route handler).
const STORAGE_BUCKET = "store-assets";

/**
 * Verifies the `store-assets` bucket exists and creates it (public, with the
 * same limits as `supabase/storage.sql`) when SUPABASE_SERVICE_ROLE_KEY is
 * configured. Called once per browser session before uploads; always returns
 * 200 so a missing service key never blocks the upload flow.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const url = ensureProtocol(
      cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_URL),
      "https"
    );
    const serviceKey = cleanUrlInput(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const parsed = safeParseUrl(url);

    if (!parsed || !serviceKey) {
      return NextResponse.json({ configured: false, exists: null, created: false });
    }

    const admin = createClient(urlToString(parsed), serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing, error: getError } = await admin.storage.getBucket(STORAGE_BUCKET);
    if (getError) {
      console.error("[storage] bucket lookup failed", {
        bucket: STORAGE_BUCKET,
        status: getError.status,
        message: getError.message,
      });
    }

    if (existing) {
      return NextResponse.json({ configured: true, exists: true, created: false });
    }

    const { error: createError } = await admin.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
        "image/svg+xml",
      ],
    });

    if (createError) {
      // "Bucket already exists" style races are fine — report and move on.
      console.warn("[storage] bucket creation failed", {
        bucket: STORAGE_BUCKET,
        status: createError.status,
        message: createError.message,
      });
      return NextResponse.json({ configured: true, exists: false, created: false });
    }

    return NextResponse.json({ configured: true, exists: true, created: true });
  } catch (error) {
    console.error("[storage] bucket check error", error);
    return createErrorResponse(error, "Bucket check failed");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  hashPassword,
  resolveStoreAccess,
  type SessionUser,
} from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/server";
import { withRateLimit, authRateLimiter } from "@/lib/rate-limit";
import { extractDbErrorInfo, createErrorResponse } from "@/lib/errors";

function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  // "?" alone or whitespace-only paths are meaningless.
  if (trimmed === "/" || trimmed.length > 500) return null;
  return trimmed;
}

function displayNameFromMetadata(
  metadata: Record<string, unknown> | undefined,
  email: string
): string {
  const candidates = [
    metadata?.full_name,
    metadata?.name,
    metadata?.user_name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 100);
    }
  }
  return email.split("@")[0] || "User";
}

/**
 * Bridges a Supabase Google OAuth session into an app session.
 *
 * The browser completes `signInWithOAuth` + `exchangeCodeForSession` on
 * `/auth/callback`, then posts the Supabase access token here. We verify the
 * token against Supabase Auth, find-or-create the matching `users` row by
 * email, mint the app's own JWT session cookie and return the path the user
 * should land on (dashboard when they own a store, onboarding otherwise).
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, authRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object", code: "INVALID_PAYLOAD" },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const accessToken =
    typeof payload.accessToken === "string" ? payload.accessToken.trim() : "";
  const requestedNext = safeNextPath(payload.next);

  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing access token", code: "MISSING_TOKEN" },
      { status: 400 }
    );
  }

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return NextResponse.json(
      { error: "OAuth is not configured", code: "OAUTH_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  // Verify the Supabase access token server-side.
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user?.email) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth session", code: "INVALID_TOKEN" },
      { status: 401 }
    );
  }

  const supabaseUser = userData.user;
  const supabaseEmail = supabaseUser.email;
  if (!supabaseEmail) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth session", code: "INVALID_TOKEN" },
      { status: 401 }
    );
  }
  const email = supabaseEmail.trim().toLowerCase();
  const name = displayNameFromMetadata(
    supabaseUser.user_metadata as Record<string, unknown> | undefined,
    email
  );

  try {
    // Find the app account by email; OAuth users get a random unusable
    // password hash so they can never sign in with a password.
    let appUser = (
      await db.select().from(users).where(eq(users.email, email)).limit(1)
    )[0];

    if (!appUser) {
      const inserted = await db
        .insert(users)
        .values({
          email,
          // bcrypt of a throwaway secret — never a real credential.
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
          name,
        })
        .returning();
      appUser = inserted[0];
    }

    if (!appUser) {
      throw new Error("Failed to create user account");
    }

    const access = await resolveStoreAccess(appUser.id);

    const sessionUser: SessionUser = {
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: access?.role,
    };
    if (access) {
      sessionUser.storeId = access.store.id;
      sessionUser.storeSlug = access.store.slug;
      sessionUser.storeName = access.store.name;
    }

    const token = await createSession(sessionUser);

    // Routing: an explicit internal `next` wins (e.g. returning to checkout).
    // Otherwise merchants land on their dashboard and new users on the store
    // creation wizard with their Google name pre-filled.
    let redirectUrl: string;
    if (requestedNext) {
      redirectUrl = requestedNext;
    } else if (access) {
      redirectUrl = "/dashboard";
    } else {
      redirectUrl = `/onboarding?name=${encodeURIComponent(name)}`;
    }

    const response = NextResponse.json({ success: true, redirectUrl });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    const { code = "", message } = extractDbErrorInfo(error);
    console.error("[oauth] session bridge failed:", { code, message }, error);
    return createErrorResponse(error, "Failed to complete sign-in");
  }
}

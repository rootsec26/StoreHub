import { NextRequest, NextResponse } from "next/server";
import { signup } from "@/lib/auth";
import { createSession } from "@/lib/auth";
import { extractDbErrorInfo, isDatabaseUnreachable, createErrorResponse } from "@/lib/errors";
import { withRateLimit, authRateLimiter } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signupErrorResponse(error: unknown): NextResponse {
  const { code = "", message } = extractDbErrorInfo(error);

  console.error("[signup] failed:", { code, message }, error);

  if (code === "23505" || message.toLowerCase().includes("duplicate")) {
    return NextResponse.json(
      { error: "An account with this email already exists. Try signing in instead.", code: "DUPLICATE_EMAIL" },
      { status: 409 }
    );
  }

  if (
    code === "42P01" ||
    code === "42P06" ||
    message.includes('relation "users" does not exist')
  ) {
    return NextResponse.json(
      {
        error:
          "The `users` table is missing in the database. Run supabase/schema.sql (or node scripts/apply-migration.js) and retry.",
        code: "MISSING_TABLE",
      },
      { status: 500 }
    );
  }

  if (isDatabaseUnreachable(error)) {
    return NextResponse.json(
      {
        error:
          "Cannot reach the database. Check DATABASE_URL and your network connection, then retry.",
        code: "DATABASE_UNREACHABLE",
      },
      { status: 503 }
    );
  }

  if (code === "42501") {
    return NextResponse.json(
      {
        error:
          "The database user is not allowed to write to the `users` table. Check the role in DATABASE_URL.",
        code: "PERMISSION_DENIED",
      },
      { status: 500 }
    );
  }

  if (code === "3D000" || code === "3F000") {
    return NextResponse.json(
      {
        error:
          "The database or schema named in DATABASE_URL does not exist. Check DATABASE_URL, then run supabase/schema.sql.",
        code: "INVALID_DATABASE",
      },
      { status: 500 }
    );
  }

  if (message.startsWith("Signup failed")) {
    return NextResponse.json({ error: message, code: "SIGNUP_FAILED" }, { status: 500 });
  }

  return createErrorResponse(error);
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, authRateLimiter);
  if (rateLimitResponse) return rateLimitResponse;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  // `null`, arrays and primitives are valid JSON but are not a form payload.
  // Reading `.email` off them would throw outside any try/catch and surface
  // as a bare Next.js 500 page instead of a JSON error.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const password =
    typeof payload.password === "string" ? payload.password : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "All fields are required (name, email, password)" },
      { status: 400 }
    );
  }

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      { error: "Name must be 100 characters or fewer" },
      { status: 400 }
    );
  }

  try {
    const result = await signup(email, password, name);

    // Create session without store info (store will be created during onboarding)
    const token = await createSession({
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    });

    const response = NextResponse.json(
      { success: true, redirectUrl: "/onboarding" },
      { status: 200 }
    );

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    return signupErrorResponse(error);
  }
}

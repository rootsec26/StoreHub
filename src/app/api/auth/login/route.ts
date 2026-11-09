import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { withRateLimit, authRateLimiter } from "@/lib/rate-limit";

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

  try {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const payload = body as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required", code: "MISSING_CREDENTIALS" },
        { status: 400 }
      );
    }

    const result = await login(email, password);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid email or password", code: "INVALID_CREDENTIALS" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      user: result.user,
      redirect: result.user.storeId ? "/dashboard" : "/create-store",
    });

    response.cookies.set("session", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return createErrorResponse(error, "Login failed");
  }
}

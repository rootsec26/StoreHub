import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

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

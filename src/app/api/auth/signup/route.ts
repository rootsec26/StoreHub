import { NextRequest, NextResponse } from "next/server";
import { signup } from "@/lib/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONNECTION_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ECONNABORTED",
]);

interface DbErrorInfo {
  code?: string;
  message: string;
}

// Drizzle wraps driver failures in DrizzleQueryError, so the SQLSTATE code
// (e.g. 23505) and the real message live on `error.cause`.
function extractDbErrorInfo(error: unknown): DbErrorInfo {
  let current = error as
    | { code?: unknown; message?: unknown; cause?: unknown }
    | undefined;
  let info: DbErrorInfo = { message: "" };

  for (let depth = 0; depth < 5 && current; depth++) {
    const code = typeof current.code === "string" ? current.code : undefined;
    const message = typeof current.message === "string" ? current.message : "";

    if (code) {
      return { code, message };
    }
    if (message) {
      info = { message };
    }
    current = current.cause as typeof current;
  }

  return info;
}

// pg reports these without a SQLSTATE/code when the socket dies mid-query.
const CONNECTION_ERROR_MESSAGES = [
  "Could not connect to the database",
  "timeout expired",
  "connection timeout",
  "Connection terminated unexpectedly",
  "Connection ended unexpectedly",
  "Client has encountered a connection error",
  "the database system is starting up",
  "terminating connection due to administrator command",
  "sorry, too many clients already",
];

function isDatabaseUnreachable(error: unknown): boolean {
  const { code = "", message } = extractDbErrorInfo(error);

  // SQLSTATE class 08 = connection exception, 57P01 = admin shutdown,
  // 57P03 = cannot connect now, 53300 = too many connections.
  if (code.startsWith("08")) return true;
  if (code === "57P01" || code === "57P03" || code === "53300") return true;
  if (CONNECTION_ERROR_CODES.has(code)) return true;

  const lower = message.toLowerCase();
  return CONNECTION_ERROR_MESSAGES.some((fragment) =>
    lower.includes(fragment.toLowerCase())
  );
}

function signupErrorResponse(error: unknown): NextResponse {
  const { code = "", message } = extractDbErrorInfo(error);

  console.error("[signup] failed:", { code, message }, error);

  if (code === "23505" || message.toLowerCase().includes("duplicate")) {
    return NextResponse.json(
      { error: "An account with this email already exists. Try signing in instead." },
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
      },
      { status: 500 }
    );
  }

  if (isDatabaseUnreachable(error)) {
    return NextResponse.json(
      {
        error:
          "Cannot reach the database. Check DATABASE_URL and your network connection, then retry.",
      },
      { status: 503 }
    );
  }

  if (code === "42501") {
    return NextResponse.json(
      {
        error:
          "The database user is not allowed to write to the `users` table. Check the role in DATABASE_URL.",
      },
      { status: 500 }
    );
  }

  if (code === "3D000" || code === "3F000") {
    return NextResponse.json(
      {
        error:
          "The database or schema named in DATABASE_URL does not exist. Check DATABASE_URL, then run supabase/schema.sql.",
      },
      { status: 500 }
    );
  }

  if (message.startsWith("Signup failed")) {
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
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

    const response = NextResponse.json({
      user: result.user,
      redirect: "/create-store",
    });

    response.cookies.set("session", result.token, {
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

import { NextResponse } from "next/server";

export interface DbErrorInfo {
  code?: string;
  message: string;
}

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

export function extractDbErrorInfo(error: unknown): DbErrorInfo {
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

export function isDatabaseUnreachable(error: unknown): boolean {
  const { code = "", message } = extractDbErrorInfo(error);

  if (code.startsWith("08")) return true;
  if (code === "57P01" || code === "57P03" || code === "53300") return true;
  if (CONNECTION_ERROR_CODES.has(code)) return true;

  const lower = message.toLowerCase();
  return CONNECTION_ERROR_MESSAGES.some((fragment) =>
    lower.includes(fragment.toLowerCase())
  );
}

export function createErrorResponse(
  error: unknown,
  fallbackMessage = "Internal server error"
): NextResponse {
  const { code = "", message } = extractDbErrorInfo(error);

  if (code === "23505" || message.toLowerCase().includes("duplicate")) {
    return NextResponse.json(
      { error: "A record with this value already exists", code: "DUPLICATE_ENTRY" },
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
        error: "Required database table is missing. Run migrations and retry.",
        code: "MISSING_TABLE",
      },
      { status: 500 }
    );
  }

  if (isDatabaseUnreachable(error)) {
    return NextResponse.json(
      {
        error: "Cannot reach the database. Check configuration and network.",
        code: "DATABASE_UNREACHABLE",
      },
      { status: 503 }
    );
  }

  if (code === "42501") {
    return NextResponse.json(
      {
        error: "Database user lacks required permissions.",
        code: "PERMISSION_DENIED",
      },
      { status: 500 }
    );
  }

  if (code === "3D000" || code === "3F000") {
    return NextResponse.json(
      {
        error: "Database or schema does not exist. Check configuration.",
        code: "INVALID_DATABASE",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: fallbackMessage, code: code || undefined },
    { status: 500 }
  );
}
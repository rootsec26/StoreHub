import { NextRequest, NextResponse } from "next/server";
import type { ZodError } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stores } from "@/db/schema";
import { isAdminAuthorized } from "@/lib/admin";
import { getSession, type SessionUser } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

import { MessagingError } from "./service";

export interface MerchantContext {
  session: SessionUser;
  storeId: string;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.id) {
    throw new MessagingError("UNAUTHORIZED", "Unauthorized", 401);
  }
  return session;
}

export async function requireMerchantContext(): Promise<MerchantContext> {
  const session = await requireSession();

  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, session.id))
    .limit(1);

  if (rows.length === 0) {
    throw new MessagingError("STORE_NOT_FOUND", "Store not found", 404);
  }

  return { session, storeId: rows[0].id };
}

/** Returns a 404 response when the caller is not an authorized admin. */
export async function denyAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthorized()) return null;
  return NextResponse.json(
    { error: "Not found", code: "NOT_FOUND" },
    { status: 404 }
  );
}

export function validationResponse(error: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Invalid request",
      code: "VALIDATION_ERROR",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof MessagingError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return createErrorResponse(error, "Notification request failed");
}

export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

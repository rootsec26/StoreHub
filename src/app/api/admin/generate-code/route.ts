import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { activationCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

async function isLocalhostRequest(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const xForwardedFor = headersList.get("x-forwarded-for") || "";
  const xRealIp = headersList.get("x-real-ip") || "";

  const clientIp = xForwardedFor.split(",")[0]?.trim() || xRealIp || "";

  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp.startsWith("192.168.") ||
    clientIp.startsWith("10.") ||
    clientIp.startsWith("172.16.") ||
    clientIp.startsWith("172.17.") ||
    clientIp.startsWith("172.18.") ||
    clientIp.startsWith("172.19.") ||
    clientIp.startsWith("172.20.") ||
    clientIp.startsWith("172.21.") ||
    clientIp.startsWith("172.22.") ||
    clientIp.startsWith("172.23.") ||
    clientIp.startsWith("172.24.") ||
    clientIp.startsWith("172.25.") ||
    clientIp.startsWith("172.26.") ||
    clientIp.startsWith("172.27.") ||
    clientIp.startsWith("172.28.") ||
    clientIp.startsWith("172.29.") ||
    clientIp.startsWith("172.30.") ||
    clientIp.startsWith("172.31.")
  );
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
  const localhostAllowed = await isLocalhostRequest();
  if (!localhostAllowed) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const customCode = formData.get("customCode")?.toString().trim().toUpperCase() || "";
    const plan = formData.get("plan")?.toString() || "pro";
    const price = formData.get("price")?.toString() ? parseFloat(formData.get("price")!.toString()) : null;
    const discount = formData.get("discount")?.toString() ? parseInt(formData.get("discount")!.toString()) : 0;
    const maxUses = formData.get("maxUses")?.toString() ? parseInt(formData.get("maxUses")!.toString()) : 1;
    const durationDays = formData.get("durationDays")?.toString() ? parseInt(formData.get("durationDays")!.toString()) : null;

    let code = customCode || generateCode();

    if (customCode) {
      const existing = await db
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, code))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json({ error: "Custom code already exists", code: "DUPLICATE_CODE" }, { status: 400 });
      }
    } else {
      let attempts = 0;
      while (attempts < 10) {
        const existing = await db
          .select()
          .from(activationCodes)
          .where(eq(activationCodes.code, code))
          .limit(1);

        if (existing.length === 0) break;
        code = generateCode();
        attempts++;
      }

      if (attempts >= 10) {
        return NextResponse.json({ error: "Failed to generate unique code", code: "GENERATION_FAILED" }, { status: 500 });
      }
    }

    const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1007) : null;

    await db.insert(activationCodes).values({
      code,
      plan,
      price: price ? price.toFixed(2) : null,
      discount,
      maxUses,
      isActive: true,
      expiresAt,
    });

    return NextResponse.redirect(new URL("/admin", request.url));
  } catch (error) {
    console.error("Generate code error:", error);
    return createErrorResponse(error, "Failed to generate code");
  }
}
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme-config";
import {
  addDomainToVercel,
  verifyDomainOnVercel,
  removeDomainFromVercel,
  getDomainFromVercel,
} from "@/lib/domains";

function sanitizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, "");
}

function isValidDomain(domain: string): boolean {
  const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: rawDomain } = body;

    if (!rawDomain || typeof rawDomain !== "string") {
      return NextResponse.json(
        { error: "Domain is required", code: "MISSING_DOMAIN" },
        { status: 400 }
      );
    }

    const domain = sanitizeDomain(rawDomain);

    if (!isValidDomain(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format", code: "INVALID_DOMAIN_FORMAT" },
        { status: 400 }
      );
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    if (safeStore.customDomain && safeStore.customDomain !== domain) {
      return NextResponse.json(
        {
          error: "Store already has a custom domain. Remove it first.",
          code: "DOMAIN_EXISTS",
        },
        { status: 409 }
      );
    }

    const existingDomain = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.customDomain, domain))
      .limit(1);

    if (existingDomain.length > 0 && existingDomain[0].id !== store.id) {
      return NextResponse.json(
        { error: "Domain is already in use by another store", code: "DOMAIN_TAKEN" },
        { status: 409 }
      );
    }

    const vercelResult = await addDomainToVercel(domain);

    if (!vercelResult.success) {
      return NextResponse.json(
        {
          error: vercelResult.error || "Failed to register domain with Vercel",
          code: "VERCEL_ADD_FAILED",
          mocked: vercelResult.mocked,
        },
        { status: 502 }
      );
    }

    await db
      .update(stores)
      .set({
        customDomain: domain,
        customDomainVerified: false,
      })
      .where(eq(stores.id, store.id));

    return NextResponse.json({
      success: true,
      domain,
      verified: false,
      mocked: vercelResult.mocked,
      message: "Domain registered. Please configure DNS records and verify.",
    });
  } catch (error) {
    console.error("Add domain error:", error);
    return createErrorResponse(error, "Failed to add domain");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    if (!safeStore.customDomain) {
      return NextResponse.json({
        configured: false,
        domain: null,
        verified: false,
        status: "not_configured",
      });
    }

    const vercelResult = await getDomainFromVercel(safeStore.customDomain);

    if (!vercelResult.success) {
      return NextResponse.json(
        {
          error: vercelResult.error || "Failed to fetch domain status",
          code: "VERCEL_FETCH_FAILED",
          mocked: vercelResult.mocked,
        },
        { status: 502 }
      );
    }

    const verified = vercelResult.domain?.verified ?? safeStore.customDomainVerified;

    if (verified && !safeStore.customDomainVerified) {
      await db
        .update(stores)
        .set({ customDomainVerified: true })
        .where(eq(stores.id, store.id));
    }

    return NextResponse.json({
      configured: true,
      domain: safeStore.customDomain,
      verified,
      status: verified ? "active" : "pending_verification",
      verification: vercelResult.domain?.verification,
      mocked: vercelResult.mocked,
    });
  } catch (error) {
    console.error("Get domain error:", error);
    return createErrorResponse(error, "Failed to fetch domain status");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    if (!safeStore.customDomain) {
      return NextResponse.json(
        { error: "No custom domain configured", code: "NO_DOMAIN" },
        { status: 404 }
      );
    }

    const domain = safeStore.customDomain;

    const vercelResult = await removeDomainFromVercel(domain);

    if (!vercelResult.success) {
      return NextResponse.json(
        {
          error: vercelResult.error || "Failed to remove domain from Vercel",
          code: "VERCEL_REMOVE_FAILED",
          mocked: vercelResult.mocked,
        },
        { status: 502 }
      );
    }

    await db
      .update(stores)
      .set({
        customDomain: null,
        customDomainVerified: false,
      })
      .where(eq(stores.id, store.id));

    return NextResponse.json({
      success: true,
      message: "Custom domain removed successfully",
      mocked: vercelResult.mocked,
    });
  } catch (error) {
    console.error("Remove domain error:", error);
    return createErrorResponse(error, "Failed to remove domain");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStore = await db
      .select()
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (userStore.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const store = userStore[0];
    const safeStore = {
      ...store,
      themeConfig: store.themeConfig || DEFAULT_THEME_CONFIG,
    };

    if (!safeStore.customDomain) {
      return NextResponse.json(
        { error: "No custom domain configured", code: "NO_DOMAIN" },
        { status: 404 }
      );
    }

    const vercelResult = await verifyDomainOnVercel(safeStore.customDomain);

    if (!vercelResult.success) {
      return NextResponse.json(
        {
          error: vercelResult.error || "Failed to verify domain",
          code: "VERCEL_VERIFY_FAILED",
          mocked: vercelResult.mocked,
        },
        { status: 502 }
      );
    }

    const verified = vercelResult.verified ?? false;

    if (verified) {
      await db
        .update(stores)
        .set({ customDomainVerified: true })
        .where(eq(stores.id, store.id));
    }

    return NextResponse.json({
      success: true,
      domain: safeStore.customDomain,
      verified,
      mocked: vercelResult.mocked,
      message: verified
        ? "Domain verified successfully! SSL certificate is being provisioned."
        : "DNS records not yet verified. Please check your DNS configuration.",
    });
  } catch (error) {
    console.error("Verify domain error:", error);
    return createErrorResponse(error, "Failed to verify domain");
  }
}
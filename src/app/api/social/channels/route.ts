import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  isSocialPlatform,
  socialChannels,
  stores,
  type SocialPlatform,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  decryptSocialSecret,
  encryptSocialSecret,
  hashPageId,
  maskSocialSecret,
} from "@/lib/social-crypto";

export const runtime = "nodejs";

/**
 * Merchant API for the AI Sales Representative connection cards.
 *
 *   GET    /api/social/channels              – list connected channels (masked)
 *   POST   /api/social/channels              – connect / upsert a channel
 *   PATCH  /api/social/channels              – persona, auto-reply toggle, creds
 *   DELETE /api/social/channels?platform=...  – disconnect
 *
 * `access_token` and `page_id` are stored AES-256-GCM encrypted and are only
 * ever returned as `••••1234` masks.
 */

interface ChannelRow {
  id: string;
  platform: string;
  accessToken: string | null;
  pageId: string | null;
  pageKey: string | null;
  isConnected: boolean;
  isAutoReplyEnabled: boolean;
  aiPersonaPrompt: string | null;
}

function serialize(row: ChannelRow, origin: string) {
  return {
    id: row.id,
    platform: row.platform,
    pageIdMasked: maskSocialSecret(row.pageId),
    accessTokenMasked: maskSocialSecret(row.accessToken),
    isConnected: row.isConnected,
    isAutoReplyEnabled: row.isAutoReplyEnabled !== false,
    aiPersonaPrompt: row.aiPersonaPrompt ?? "",
    webhookUrl: `${origin}/api/webhooks/social`,
  };
}

async function getStoreId(): Promise<string | null> {
  const session = await getSession();
  if (!session?.id) return null;

  const userStore = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, session.id))
    .limit(1);

  return userStore.length > 0 ? userStore[0].id : null;
}

export async function GET(request: NextRequest) {
  try {
    const storeId = await getStoreId();
    if (!storeId) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const rows = await db
      .select()
      .from(socialChannels)
      .where(eq(socialChannels.storeId, storeId));

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      channels: rows.map((row) => serialize(row, origin)),
      webhookUrl: `${origin}/api/webhooks/social`,
    });
  } catch (error) {
    console.error("Get social channels error:", error);
    return createErrorResponse(error, "Failed to fetch social channels");
  }
}

function resolvePlatforms(body: Record<string, unknown>): SocialPlatform[] | null {
  if (typeof body.platform === "string") {
    const platform = body.platform.toUpperCase();
    return isSocialPlatform(platform) ? [platform] : null;
  }
  if (Array.isArray(body.platforms)) {
    const list = body.platforms.filter(isSocialPlatform);
    return list.length > 0 ? list : null;
  }
  return null;
}

async function upsertChannel(
  storeId: string,
  platform: SocialPlatform,
  body: Record<string, unknown>
) {
  const existingRows = await db
    .select()
    .from(socialChannels)
    .where(eq(socialChannels.storeId, storeId))
    .limit(20);
  const existing = existingRows.find((row) => row.platform === platform);

  const pageIdPlain =
    typeof body.pageId === "string" && body.pageId.trim().length > 0
      ? body.pageId.trim()
      : existing
        ? decryptSocialSecret(existing.pageId)
        : "";
  const tokenPlain =
    typeof body.accessToken === "string" && body.accessToken.trim().length > 0
      ? body.accessToken.trim()
      : existing
        ? decryptSocialSecret(existing.accessToken)
        : "";
  const persona =
    typeof body.aiPersonaPrompt === "string"
      ? body.aiPersonaPrompt.slice(0, 4000)
      : (existing?.aiPersonaPrompt ?? "");
  const autoReply =
    typeof body.isAutoReplyEnabled === "boolean"
      ? body.isAutoReplyEnabled
      : (existing?.isAutoReplyEnabled ?? true);

  const values = {
    storeId,
    platform,
    accessToken: encryptSocialSecret(tokenPlain),
    pageId: encryptSocialSecret(pageIdPlain),
    pageKey: hashPageId(pageIdPlain),
    isConnected: Boolean(pageIdPlain && tokenPlain),
    isAutoReplyEnabled: autoReply,
    aiPersonaPrompt: persona,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(socialChannels)
      .set(values)
      .where(eq(socialChannels.id, existing.id));
    return;
  }

  await db.insert(socialChannels).values(values);
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await getStoreId();
    if (!storeId) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const platforms = resolvePlatforms(body);
    if (!platforms) {
      return NextResponse.json(
        { error: "A valid platform is required", code: "INVALID_PLATFORM" },
        { status: 400 }
      );
    }

    for (const platform of platforms) {
      await upsertChannel(storeId, platform, body);
    }

    const rows = await db
      .select()
      .from(socialChannels)
      .where(eq(socialChannels.storeId, storeId));

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      channels: rows.map((row) => serialize(row, origin)),
    });
  } catch (error) {
    console.error("Connect social channel error:", error);
    return createErrorResponse(error, "Failed to save social channel");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const storeId = await getStoreId();
    if (!storeId) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const platforms = resolvePlatforms(body);

    if (platforms) {
      for (const platform of platforms) {
        await upsertChannel(storeId, platform, body);
      }
    } else if (typeof body.aiPersonaPrompt === "string") {
      // Persona-only save with no target: apply to every channel of the store.
      const rows = await db
        .select()
        .from(socialChannels)
        .where(eq(socialChannels.storeId, storeId))
        .limit(20);
      if (rows.length === 0) {
        await upsertChannel(storeId, "FACEBOOK", body);
      } else {
        for (const row of rows) {
          await upsertChannel(storeId, row.platform as SocialPlatform, body);
        }
      }
    } else {
      return NextResponse.json(
        { error: "Nothing to update", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(socialChannels)
      .where(eq(socialChannels.storeId, storeId));

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      channels: rows.map((row) => serialize(row, origin)),
    });
  } catch (error) {
    console.error("Update social channel error:", error);
    return createErrorResponse(error, "Failed to update social channel");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storeId = await getStoreId();
    if (!storeId) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const platformRaw =
      request.nextUrl.searchParams.get("platform") ??
      ((await request.json().catch(() => ({}))) as Record<string, unknown>).platform;

    const platform =
      typeof platformRaw === "string" && isSocialPlatform(platformRaw.toUpperCase())
        ? platformRaw.toUpperCase()
        : null;
    if (!platform) {
      return NextResponse.json(
        { error: "A valid platform is required", code: "INVALID_PLATFORM" },
        { status: 400 }
      );
    }

    await db
      .delete(socialChannels)
      .where(and(eq(socialChannels.storeId, storeId), eq(socialChannels.platform, platform)));

    const rows = await db
      .select()
      .from(socialChannels)
      .where(eq(socialChannels.storeId, storeId));

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      channels: rows.map((row) => serialize(row, origin)),
    });
  } catch (error) {
    console.error("Disconnect social channel error:", error);
    return createErrorResponse(error, "Failed to disconnect social channel");
  }
}

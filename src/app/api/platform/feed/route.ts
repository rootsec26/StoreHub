import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  PLATFORM_POST_CATEGORIES,
  platformFollows,
  platformPosts,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAdminAuthorized } from "@/lib/admin";
import { createErrorResponse } from "@/lib/errors";
import { safeParseUrl, cleanUrlInput } from "@/lib/url";

export const runtime = "nodejs";

const MAX_POSTS = 50;
const MAX_CONTENT_LENGTH = 2000;
const MAX_LINK_LENGTH = 2048;
const FOLLOWER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface PlatformPostDTO {
  id: string;
  authorName: string;
  content: string;
  category: string;
  linkUrl: string;
  createdAt: string;
}

function isValidFollowerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FOLLOWER_ID_PATTERN.test(value) &&
    value.length <= 64
  );
}

/** Session user id wins; anonymous visitors use a client-generated id. */
async function resolveFollowerId(
  provided: unknown
): Promise<string | null> {
  const session = await getSession();
  if (session?.id) return session.id;
  return isValidFollowerId(provided) ? provided : null;
}

async function followerCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformFollows);
  return rows[0]?.count ?? 0;
}

async function isFollowingPlatform(followerId: string): Promise<boolean> {
  const rows = await db
    .select({ id: platformFollows.id })
    .from(platformFollows)
    .where(eq(platformFollows.followerId, followerId))
    .limit(1);
  return rows.length > 0;
}

/**
 * GET /api/platform/feed?followerId=...
 * Public: published platform posts (newest first) plus the follower count and
 * whether the caller already follows the feed.
 */
export async function GET(request: NextRequest) {
  try {
    const followerIdParam = request.nextUrl.searchParams.get("followerId");
    const followerId = await resolveFollowerId(followerIdParam);

    const [posts, count, following] = await Promise.all([
      db
        .select({
          id: platformPosts.id,
          authorName: platformPosts.authorName,
          content: platformPosts.content,
          category: platformPosts.category,
          linkUrl: platformPosts.linkUrl,
          createdAt: platformPosts.createdAt,
        })
        .from(platformPosts)
        .where(eq(platformPosts.isPublished, true))
        .orderBy(desc(platformPosts.createdAt))
        .limit(MAX_POSTS),
      followerCount(),
      followerId ? isFollowingPlatform(followerId) : Promise.resolve(false),
    ]);

    return NextResponse.json({
      posts: posts.map(
        (post): PlatformPostDTO => ({
          ...post,
          createdAt: post.createdAt.toISOString(),
        })
      ),
      followerCount: count,
      following,
    });
  } catch (error) {
    console.error("[api/platform/feed] GET failed:", error);
    return createErrorResponse(error, "Failed to load platform feed");
  }
}

function sanitizeLinkUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const value = cleanUrlInput(raw);
  if (!value) return "";
  if (value.length > MAX_LINK_LENGTH) return null;
  // Internal paths are allowed; absolute URLs must be http(s).
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  const parsed = safeParseUrl(value);
  if (!parsed) return null;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  return value;
}

/**
 * POST /api/platform/feed — super-admin only.
 * Body: { content, category?, linkUrl?, authorName? }
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthorized())) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          error: `Content is required (max ${MAX_CONTENT_LENGTH} characters)`,
          code: "INVALID_CONTENT",
        },
        { status: 400 }
      );
    }

    const category =
      typeof body.category === "string" &&
      (PLATFORM_POST_CATEGORIES as readonly string[]).includes(body.category)
        ? body.category
        : "UPDATE";

    const linkUrl = sanitizeLinkUrl(body.linkUrl);
    if (linkUrl === null) {
      return NextResponse.json(
        { error: "linkUrl must be a relative path or http(s) URL", code: "INVALID_LINK" },
        { status: 400 }
      );
    }

    const authorName =
      typeof body.authorName === "string" && body.authorName.trim()
        ? body.authorName.trim().slice(0, 80)
        : "StoreHub";

    const [post] = await db
      .insert(platformPosts)
      .values({ content, category, linkUrl, authorName })
      .returning({
        id: platformPosts.id,
        authorName: platformPosts.authorName,
        content: platformPosts.content,
        category: platformPosts.category,
        linkUrl: platformPosts.linkUrl,
        createdAt: platformPosts.createdAt,
      });

    return NextResponse.json(
      {
        post: post
          ? { ...post, createdAt: post.createdAt.toISOString() }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/platform/feed] POST failed:", error);
    return createErrorResponse(error, "Failed to publish post");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { storeGroupPosts, storeGroups, stores } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_CONTENT_LENGTH = 2000;
const MAX_POSTS = 100;

async function requireGroup() {
  const session = await getSession();
  if (!session?.id) return { error: "unauthorized" as const };
  const userStore = await getAccessibleStores(session.id);
  if (userStore.length === 0) return { error: "no-store" as const };
  const store = userStore[0];

  const groupRows = await db
    .select()
    .from(storeGroups)
    .where(eq(storeGroups.storeId, store.id))
    .limit(1);
  const group = groupRows[0];
  if (!group) return { error: "no-group" as const };
  return { group, store };
}

function errorResponse(kind: "unauthorized" | "no-store" | "no-group") {
  if (kind === "unauthorized") {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  if (kind === "no-store") {
    return NextResponse.json(
      { error: "Store not found", code: "STORE_NOT_FOUND" },
      { status: 404 }
    );
  }
  return NextResponse.json(
    { error: "Create your store group first", code: "NO_GROUP" },
    { status: 404 }
  );
}

/** GET /api/dashboard/group/posts — merchant's group posts (newest first). */
export async function GET() {
  try {
    const ctx = await requireGroup();
    if ("error" in ctx) return errorResponse(ctx.error!);

    const posts = await db
      .select({
        id: storeGroupPosts.id,
        authorName: storeGroupPosts.authorName,
        content: storeGroupPosts.content,
        createdAt: storeGroupPosts.createdAt,
      })
      .from(storeGroupPosts)
      .where(eq(storeGroupPosts.groupId, ctx.group.id))
      .orderBy(desc(storeGroupPosts.createdAt))
      .limit(MAX_POSTS);

    return NextResponse.json({
      posts: posts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    });
  } catch (error) {
    console.error("[api/dashboard/group/posts] GET failed:", error);
    return createErrorResponse(error, "Failed to load group posts");
  }
}

/** POST /api/dashboard/group/posts — publish a post (merchant only). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireGroup();
    if ("error" in ctx) return errorResponse(ctx.error!);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          error: `Content is required (max ${MAX_CONTENT_LENGTH} characters)`,
          code: "INVALID_CONTENT",
        },
        { status: 400 }
      );
    }

    const [post] = await db
      .insert(storeGroupPosts)
      .values({
        groupId: ctx.group.id,
        authorName: ctx.store.name || "Store",
        content,
      })
      .returning({
        id: storeGroupPosts.id,
        authorName: storeGroupPosts.authorName,
        content: storeGroupPosts.content,
        createdAt: storeGroupPosts.createdAt,
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
    console.error("[api/dashboard/group/posts] POST failed:", error);
    return createErrorResponse(error, "Failed to publish post");
  }
}

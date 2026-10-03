import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aiChatSessions, stores } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import {
  handOverSession,
  resumeAiSession,
} from "@/lib/ai/social-sales-bot";

export const runtime = "nodejs";

/**
 * Live chat inspection API for the AI Sales Representative.
 *
 *   GET   /api/social/sessions           – thread list (preview + status)
 *   GET   /api/social/sessions?id=...    – one thread with full history
 *   PATCH /api/social/sessions           – take over / hand back / manual reply
 *
 * PATCH body:
 *   { id, status: "HANDED_TO_HUMAN" | "ACTIVE" }   – takeover toggle
 *   { id, reply: "نص الرد" }                       – merchant sends a manual
 *                                                   message (implies takeover)
 */

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

function preview(history: { content?: string }[] | null | undefined): string {
  if (!history || history.length === 0) return "";
  const last = history[history.length - 1];
  const text = (last?.content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
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

    const sessionId = request.nextUrl.searchParams.get("id");

    if (sessionId) {
      const rows = await db
        .select()
        .from(aiChatSessions)
        .where(
          and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.storeId, storeId))
        )
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json(
          { error: "Session not found", code: "SESSION_NOT_FOUND" },
          { status: 404 }
        );
      }
      return NextResponse.json({ session: rows[0] });
    }

    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.storeId, storeId))
      .orderBy(desc(aiChatSessions.updatedAt))
      .limit(50);

    const summary = {
      active: rows.filter((row) => row.status === "ACTIVE").length,
      orderCreated: rows.filter((row) => row.status === "ORDER_CREATED").length,
      handedOver: rows.filter((row) => row.status === "HANDED_TO_HUMAN").length,
    };

    return NextResponse.json({
      sessions: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        customerPhoneOrPsid: row.customerPhoneOrPsid,
        customerName: row.customerName ?? "",
        status: row.status,
        orderId: row.orderId,
        preview: preview(row.conversationHistory),
        messageCount: (row.conversationHistory ?? []).length,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      })),
      summary,
    });
  } catch (error) {
    console.error("Get social sessions error:", error);
    return createErrorResponse(error, "Failed to fetch chat sessions");
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
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json(
        { error: "Session id is required", code: "INVALID_PAYLOAD" },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(aiChatSessions)
      .where(and(eq(aiChatSessions.id, id), eq(aiChatSessions.storeId, storeId)))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const session = rows[0];
    const reply = typeof body.reply === "string" ? body.reply.trim() : "";

    // Manual reply: append the merchant's message and take the thread over.
    if (reply) {
      const history = [...(session.conversationHistory ?? [])];
      if (reply.length > 0) {
        history.push({
          role: "assistant",
          content: reply.slice(0, 2000),
          at: new Date().toISOString(),
        });
      }

      const updated = await db
        .update(aiChatSessions)
        .set({
          conversationHistory: history.slice(-80),
          status: "HANDED_TO_HUMAN",
          updatedAt: new Date(),
        })
        .where(eq(aiChatSessions.id, session.id))
        .returning();

      return NextResponse.json({ session: updated[0] });
    }

    const status = typeof body.status === "string" ? body.status : "";
    if (status !== "HANDED_TO_HUMAN" && status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Unsupported status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const changed =
      status === "HANDED_TO_HUMAN"
        ? await handOverSession(session.id, storeId)
        : await resumeAiSession(session.id, storeId);

    if (!changed) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const refreshed = await db
      .select()
      .from(aiChatSessions)
      .where(eq(aiChatSessions.id, session.id))
      .limit(1);

    return NextResponse.json({ session: refreshed[0] });
  } catch (error) {
    console.error("Update social session error:", error);
    return createErrorResponse(error, "Failed to update chat session");
  }
}

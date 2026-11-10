import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  storeFollowers,
  storeVerificationRequests,
  stores,
} from "@/db/schema";
import { denyAdmin, errorResponse } from "@/lib/messaging/server";
import { FREE_VERIFICATION_FOLLOWER_TARGET } from "@/lib/verification";

export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    requestId: z.string().uuid(),
    adminNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    requestId: z.string().uuid(),
    adminNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("revoke"),
    storeId: z.string().uuid(),
  }),
]);

async function followerCountsByStore(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      storeId: storeFollowers.storeId,
      count: sql<number>`count(*)::int`,
    })
    .from(storeFollowers)
    .groupBy(storeFollowers.storeId);
  return new Map(rows.map((r) => [r.storeId, r.count]));
}

/**
 * GET /api/admin/verification — every verification request (with payment
 * proof for review) plus per-store verification state and follower counts.
 */
export async function GET() {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const [requests, storeRows, followerCounts] = await Promise.all([
      db
        .select({
          id: storeVerificationRequests.id,
          storeId: storeVerificationRequests.storeId,
          storeName: stores.name,
          storeSlug: stores.slug,
          type: storeVerificationRequests.type,
          status: storeVerificationRequests.status,
          paymentReference: storeVerificationRequests.paymentReference,
          paymentProof: storeVerificationRequests.paymentProof,
          adminNote: storeVerificationRequests.adminNote,
          createdAt: storeVerificationRequests.createdAt,
          reviewedAt: storeVerificationRequests.reviewedAt,
        })
        .from(storeVerificationRequests)
        .innerJoin(stores, eq(stores.id, storeVerificationRequests.storeId))
        .orderBy(desc(storeVerificationRequests.createdAt))
        .limit(200),
      db
        .select({
          id: stores.id,
          name: stores.name,
          slug: stores.slug,
          isVerified: stores.isVerified,
          verificationType: stores.verificationType,
          verifiedAt: stores.verifiedAt,
          followerBoost: stores.followerBoost,
        })
        .from(stores)
        .orderBy(stores.name)
        .limit(1000),
      followerCountsByStore(),
    ]);

    return NextResponse.json({
      requests: requests.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
      stores: storeRows.map((s) => ({
        ...s,
        verifiedAt: s.verifiedAt?.toISOString() ?? null,
        followerCount:
          (followerCounts.get(s.id) ?? 0) + Math.max(0, s.followerBoost ?? 0),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/admin/verification
 *  - approve : verify the request's store instantly (badge goes live) and
 *              grant the 10k-follower milestone boost
 *  - reject  : reject the request with an optional admin note
 *  - revoke  : remove verification from a store — badge, type, timestamps
 *              and the follower boost are all cleared
 */
export async function POST(request: NextRequest) {
  try {
    const denied = await denyAdmin();
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const validation = postSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const data = validation.data;

    if (data.action === "approve" || data.action === "reject") {
      const rows = await db
        .select()
        .from(storeVerificationRequests)
        .where(eq(storeVerificationRequests.id, data.requestId))
        .limit(1);
      const req = rows[0];
      if (!req) {
        return NextResponse.json(
          { error: "Request not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      if (req.status !== "pending") {
        return NextResponse.json(
          { error: "Request already reviewed", code: "ALREADY_REVIEWED" },
          { status: 409 }
        );
      }

      if (data.action === "reject") {
        await db
          .update(storeVerificationRequests)
          .set({
            status: "rejected",
            adminNote: data.adminNote?.trim() ?? "",
            reviewedAt: new Date(),
          })
          .where(eq(storeVerificationRequests.id, req.id));
        return NextResponse.json({ ok: true, status: "rejected" });
      }

      await db
        .update(storeVerificationRequests)
        .set({
          status: "approved",
          adminNote: data.adminNote?.trim() ?? "",
          reviewedAt: new Date(),
        })
        .where(eq(storeVerificationRequests.id, req.id));

      // Follower milestone boost: top the displayed count up to the 10k
      // verification target so the merchant's progress bar reads 10,000/10,000.
      // Real followers keep accumulating on top of the boost.
      const realFollowers = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(storeFollowers)
        .where(eq(storeFollowers.storeId, req.storeId));
      const followerBoost = Math.max(
        0,
        FREE_VERIFICATION_FOLLOWER_TARGET - (realFollowers[0]?.count ?? 0)
      );

      await db
        .update(stores)
        .set({
          isVerified: true,
          verificationType: req.type,
          verifiedAt: new Date(),
          followerBoost,
        })
        .where(eq(stores.id, req.storeId));

      return NextResponse.json({ ok: true, status: "approved" });
    }

    // revoke — strip the verified badge and the milestone boost.
    const revoked = await db
      .update(stores)
      .set({
        isVerified: false,
        verificationType: null,
        verifiedAt: null,
        followerBoost: 0,
      })
      .where(eq(stores.id, data.storeId))
      .returning({ id: stores.id });

    if (revoked.length === 0) {
      return NextResponse.json(
        { error: "Store not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, status: "revoked" });
  } catch (error) {
    return errorResponse(error);
  }
}

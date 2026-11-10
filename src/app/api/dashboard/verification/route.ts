import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { storeFollowers, storeVerificationRequests } from "@/db/schema";
import { getAccessibleStores, getSession } from "@/lib/auth";
import { createErrorResponse } from "@/lib/errors";
import { FREE_VERIFICATION_FOLLOWER_TARGET } from "@/lib/verification";

export const runtime = "nodejs";

/** ~6 MB of binary once base64-encoded — same ceiling as order payment proofs. */
const MAX_PROOF_DATA_URL_LENGTH = 8_000_000;
const PROOF_DATA_URL_PATTERN =
  /^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim-free") }),
  z.object({
    action: z.literal("submit-paid"),
    paymentReference: z.string().max(200).optional(),
    paymentProof: z.string().max(MAX_PROOF_DATA_URL_LENGTH).optional(),
  }),
]);

async function requireStore() {
  const session = await getSession();
  if (!session?.id) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  const userStore = await getAccessibleStores(session.id);
  if (userStore.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      ),
    };
  }

  return { store: userStore[0] };
}

async function followerCount(storeId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storeFollowers)
    .where(eq(storeFollowers.storeId, storeId));
  return rows[0]?.count ?? 0;
}

/** Real follower rows + the verification milestone boost. */
function effectiveFollowerCount(
  realCount: number,
  followerBoost: number | null | undefined
): number {
  return realCount + Math.max(0, followerBoost ?? 0);
}

function serializeRequest(row: typeof storeVerificationRequests.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    paymentReference: row.paymentReference,
    paymentProof: row.paymentProof,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * GET /api/dashboard/verification — verification state, follower progress and
 * the merchant's request history for the Store Verification (توثيق المتجر) tab.
 */
export async function GET() {
  try {
    const ctx = await requireStore();
    if ("error" in ctx) return ctx.error;
    const store = ctx.store;

    const [count, requests] = await Promise.all([
      followerCount(store.id),
      db
        .select()
        .from(storeVerificationRequests)
        .where(eq(storeVerificationRequests.storeId, store.id))
        .orderBy(desc(storeVerificationRequests.createdAt))
        .limit(20),
    ]);

    const pending = requests.find((r) => r.status === "pending") ?? null;

    return NextResponse.json({
      followerCount: effectiveFollowerCount(count, store.followerBoost),
      followerTarget: FREE_VERIFICATION_FOLLOWER_TARGET,
      isVerified: store.isVerified,
      verificationType: store.verificationType,
      verifiedAt: store.verifiedAt?.toISOString() ?? null,
      pendingRequest: pending ? serializeRequest(pending) : null,
      requests: requests.map(serializeRequest),
    });
  } catch (error) {
    console.error("[api/dashboard/verification] GET failed:", error);
    return createErrorResponse(error, "Failed to load verification status");
  }
}

/**
 * POST /api/dashboard/verification
 *  - claim-free   : request free verification (requires the follower milestone)
 *  - submit-paid  : submit Vodafone Cash payment reference / screenshot
 * Admins approve requests directly — there is no merchant-facing code step.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStore();
    if ("error" in ctx) return ctx.error;
    const store = ctx.store;

    const body = await request.json().catch(() => null);
    const validation = postSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const data = validation.data;

    if (data.action === "claim-free") {
      if (store.isVerified) {
        return NextResponse.json(
          { error: "Store is already verified", code: "ALREADY_VERIFIED" },
          { status: 409 }
        );
      }

      const count = effectiveFollowerCount(
        await followerCount(store.id),
        store.followerBoost
      );
      if (count < FREE_VERIFICATION_FOLLOWER_TARGET) {
        return NextResponse.json(
          {
            error: `Free verification requires ${FREE_VERIFICATION_FOLLOWER_TARGET.toLocaleString()} followers`,
            code: "FOLLOWER_TARGET_NOT_MET",
            followerCount: count,
            followerTarget: FREE_VERIFICATION_FOLLOWER_TARGET,
          },
          { status: 400 }
        );
      }

      const hasPending = await db
        .select({ id: storeVerificationRequests.id })
        .from(storeVerificationRequests)
        .where(
          sql`${storeVerificationRequests.storeId} = ${store.id} AND ${storeVerificationRequests.status} = 'pending'`
        )
        .limit(1);
      if (hasPending.length > 0) {
        return NextResponse.json(
          { error: "A verification request is already pending", code: "REQUEST_PENDING" },
          { status: 409 }
        );
      }

      await db.insert(storeVerificationRequests).values({
        storeId: store.id,
        type: "free",
        status: "pending",
      });

      return NextResponse.json({ ok: true, status: "pending" });
    }

    if (data.action === "submit-paid") {
      if (store.isVerified) {
        return NextResponse.json(
          { error: "Store is already verified", code: "ALREADY_VERIFIED" },
          { status: 409 }
        );
      }

      const paymentReference = (data.paymentReference ?? "").trim().slice(0, 200);
      const paymentProof = (data.paymentProof ?? "").trim();

      if (!paymentReference && !paymentProof) {
        return NextResponse.json(
          {
            error: "Provide the Vodafone Cash transaction reference or a screenshot",
            code: "MISSING_PAYMENT_DETAILS",
          },
          { status: 400 }
        );
      }

      if (
        paymentProof &&
        (paymentProof.length > MAX_PROOF_DATA_URL_LENGTH ||
          !PROOF_DATA_URL_PATTERN.test(paymentProof))
      ) {
        return NextResponse.json(
          { error: "Invalid payment screenshot", code: "INVALID_PROOF" },
          { status: 400 }
        );
      }

      const hasPending = await db
        .select({ id: storeVerificationRequests.id })
        .from(storeVerificationRequests)
        .where(
          sql`${storeVerificationRequests.storeId} = ${store.id} AND ${storeVerificationRequests.status} = 'pending'`
        )
        .limit(1);
      if (hasPending.length > 0) {
        return NextResponse.json(
          { error: "A verification request is already pending", code: "REQUEST_PENDING" },
          { status: 409 }
        );
      }

      await db.insert(storeVerificationRequests).values({
        storeId: store.id,
        type: "paid",
        status: "pending",
        paymentReference,
        paymentProof,
      });

      return NextResponse.json({ ok: true, status: "pending" });
    }

    return NextResponse.json(
      { error: "Unknown action", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[api/dashboard/verification] POST failed:", error);
    return createErrorResponse(error, "Verification request failed");
  }
}

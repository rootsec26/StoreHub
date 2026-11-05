import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  notificationEvents,
  notificationRecipients,
  notifications,
} from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { isValidPhoneNumber, normalizePhoneDigits } from "@/lib/order-tracking";
import { getStoreBySlug } from "@/lib/storefront";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_ITEMS = 50;

/**
 * Guest-facing customer inbox for a storefront.
 *
 * Storefront shoppers are anonymous, so identity is the phone number they
 * used at checkout — the same trust model as `/api/storefront/orders/track`.
 * Messages are the per-recipient rows created by merchant campaigns
 * (`MERCHANT_TO_CUSTOMER` notifications), which snapshot the delivery phone
 * and optionally link a `customers` row.
 */

/**
 * Phones are stored in mixed formats across orders/customers/recipients
 * ("0100…", "+20 100…", "20100…"). Expand the entered number into the digit
 * variants we may have stored so all of them match.
 */
function phoneDigitVariants(phone: string): string[] {
  const variants = new Set<string>();
  const add = (value: string) => {
    if (value.length >= 8 && value.length <= 15) variants.add(value);
  };

  let digits = normalizePhoneDigits(phone);
  add(digits);
  if (digits.startsWith("00")) digits = digits.slice(2);
  add(digits);
  if (digits.startsWith("0")) {
    add(`20${digits.slice(1)}`);
    add(digits.slice(1));
  }
  if (digits.startsWith("20") && digits.length >= 11) {
    add(`0${digits.slice(2)}`);
    add(digits.slice(2));
  }
  return [...variants];
}

function digitsOf(column: typeof notificationRecipients.recipientPhone | typeof customers.phone) {
  return sql`regexp_replace(${column}, '\\D', '', 'g')`;
}

/** Resolve the storefront store + the phone variants used for matching. */
async function resolveIdentity(slug: string, phone: string) {
  const store = await getStoreBySlug(slug);
  if (!store) return { error: "Store not found", status: 404 as const };

  if (!phone || !isValidPhoneNumber(phone)) {
    return { error: "A valid phone number is required", status: 400 as const };
  }

  const variants = phoneDigitVariants(phone);
  if (variants.length === 0) {
    return { error: "A valid phone number is required", status: 400 as const };
  }

  return { store, variants };
}

/** Recipient rows addressed to this shopper inside this store. */
function recipientIdentityConditions(
  storeId: string,
  variants: string[],
  customerIds: string[]
) {
  const phoneMatch = or(
    ...variants.map(
      (variant) =>
        sql`${digitsOf(notificationRecipients.recipientPhone)} = ${variant}`
    )
  );
  const identity =
    customerIds.length > 0
      ? or(
          inArray(notificationRecipients.customerId, customerIds),
          phoneMatch
        )
      : phoneMatch;

  return and(
    eq(notificationRecipients.storeId, storeId),
    eq(notificationRecipients.recipientType, "CUSTOMER"),
    inArray(notificationRecipients.status, ["SENT", "DELIVERED", "READ"]),
    identity
  );
}

async function findCustomerIds(storeId: string, variants: string[]) {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.storeId, storeId),
        or(
          ...variants.map(
            (variant) => sql`${digitsOf(customers.phone)} = ${variant}`
          )
        )
      )
    );
  return rows.map((row) => row.id);
}

/** GET /api/storefront/notifications?slug=&phone= — customer inbox. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const slug = params.get("slug")?.trim() || "";
    const phone = params.get("phone")?.trim() || "";
    const limit = Math.min(
      Math.max(Number(params.get("limit") ?? 20) || 20, 1),
      MAX_ITEMS
    );

    if (!slug) {
      return NextResponse.json(
        { error: "Store slug is required", code: "MISSING_SLUG" },
        { status: 400 }
      );
    }

    const identity = await resolveIdentity(slug, phone);
    if ("error" in identity) {
      return NextResponse.json(
        { error: identity.error, code: "INVALID_REQUEST" },
        { status: identity.status }
      );
    }
    const { store, variants } = identity;

    const customerIds = await findCustomerIds(store.id, variants);
    const recipientWhere = recipientIdentityConditions(
      store.id,
      variants,
      customerIds
    );

    const activeFilter = or(
      isNull(notifications.expiresAt),
      gte(notifications.expiresAt, new Date())
    );

    const where = and(
      recipientWhere,
      inArray(notifications.status, ["SENT", "PARTIAL"]),
      activeFilter
    );

    const [rows, unreadRow] = await Promise.all([
      db
        .select({
          recipientId: notificationRecipients.id,
          notificationId: notifications.id,
          title: notifications.title,
          body: notifications.body,
          category: notifications.category,
          priority: notifications.priority,
          status: notificationRecipients.status,
          sentAt: notificationRecipients.sentAt,
          deliveredAt: notificationRecipients.deliveredAt,
          readAt: notificationRecipients.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notificationRecipients)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationRecipients.notificationId)
        )
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(limit),
      db
        .select({ value: sql<number>`(count(*))::int` })
        .from(notificationRecipients)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationRecipients.notificationId)
        )
        .where(
          and(where, isNull(notificationRecipients.readAt))
        ),
    ]);

    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.recipientId,
        notificationId: row.notificationId,
        title: row.title,
        body: row.body,
        category: row.category,
        priority: row.priority,
        status: row.status,
        sentAt: (row.sentAt ?? row.deliveredAt ?? row.createdAt).toISOString(),
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt ? row.readAt.toISOString() : null,
      })),
      unreadCount: Number(unreadRow?.[0]?.value ?? 0),
    });
  } catch (error) {
    console.error("[storefront/notifications] GET failed:", error);
    return createErrorResponse(error, "Failed to load notifications");
  }
}

/**
 * POST /api/storefront/notifications — mark inbox items as read.
 * Body: { slug, phone, ids?: string[] } — empty/missing `ids` marks all.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
    const ids = rawIds
      .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
      .slice(0, 100);

    if (!slug) {
      return NextResponse.json(
        { error: "Store slug is required", code: "MISSING_SLUG" },
        { status: 400 }
      );
    }

    const identity = await resolveIdentity(slug, phone);
    if ("error" in identity) {
      return NextResponse.json(
        { error: identity.error, code: "INVALID_REQUEST" },
        { status: identity.status }
      );
    }
    const { store, variants } = identity;

    const customerIds = await findCustomerIds(store.id, variants);
    const conditions = [
      recipientIdentityConditions(store.id, variants, customerIds)!,
      isNull(notificationRecipients.readAt),
    ];
    if (ids.length > 0) {
      conditions.push(inArray(notificationRecipients.id, ids));
    }

    const updated = await db
      .update(notificationRecipients)
      .set({ status: "READ", readAt: new Date() })
      .where(and(...conditions))
      .returning({
        id: notificationRecipients.id,
        notificationId: notificationRecipients.notificationId,
      });

    const byNotification = new Map<string, number>();
    for (const row of updated) {
      byNotification.set(
        row.notificationId,
        (byNotification.get(row.notificationId) ?? 0) + 1
      );
    }
    if (byNotification.size > 0) {
      await db.insert(notificationEvents).values(
        Array.from(byNotification.entries()).map(([notificationId, count]) => ({
          notificationId,
          actorType: "SYSTEM" as const,
          actorUserId: null,
          event: "READ" as const,
          metadata: { recipients: count, source: "storefront" },
          ipAddress: null,
        }))
      );
    }

    return NextResponse.json({ success: true, updated: updated.length });
  } catch (error) {
    console.error("[storefront/notifications] POST failed:", error);
    return createErrorResponse(error, "Failed to update notifications");
  }
}

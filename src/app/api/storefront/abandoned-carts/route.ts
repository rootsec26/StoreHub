import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { abandonedCarts, stores } from "@/db/schema";
import { createErrorResponse } from "@/lib/errors";
import { abandonedCartRateLimiter, withRateLimit } from "@/lib/rate-limit";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import {
  cartQuantity,
  cartTotal,
  type AbandonedCartItem,
} from "@/lib/abandoned-carts";

export const runtime = "nodejs";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 999;

function sanitizeItems(value: unknown): AbandonedCartItem[] {
  if (!Array.isArray(value)) return [];

  const items: AbandonedCartItem[] = [];
  for (const raw of value.slice(0, MAX_CART_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const productId = asText(item.productId).slice(0, 120);
    const name = asText(item.name).slice(0, 200);
    if (!productId && !name) continue;

    const quantity = Math.min(
      MAX_ITEM_QUANTITY,
      Math.max(1, Math.floor(Number(item.quantity) || 1))
    );
    const price = Number.parseFloat(String(item.price ?? "0"));
    const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
    items.push({
      productId,
      name,
      price: safePrice.toFixed(2),
      quantity,
      imageUrl: asText(item.imageUrl).slice(0, 500),
    });
  }
  return items;
}

async function resolveStore(body: Record<string, unknown>) {
  const slug = asText(body.slug);
  const storeId = asText(body.storeId);

  if (slug) {
    const rows = await db
      .select({ id: stores.id, slug: stores.slug })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);
    return rows[0];
  }

  if (storeId) {
    const rows = await db
      .select({ id: stores.id, slug: stores.slug })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    return rows[0];
  }

  return undefined;
}

/**
 * Guest checkout auto-save endpoint (public, store identified by slug/storeId).
 * Creates or refreshes the pending abandoned-cart snapshot for the shopper.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(
      request,
      abandonedCartRateLimiter
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const store = await resolveStore(body);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const action = asText(body.action) || "save";
    const recoveryToken = asText(body.recoveryToken);

    // Order completed through a recovery link -> close the abandoned cart.
    if (action === "recovered") {
      if (!recoveryToken) {
        return NextResponse.json(
          { error: "Recovery token is required", code: "MISSING_TOKEN" },
          { status: 400 }
        );
      }

      const updated = await db
        .update(abandonedCarts)
        .set({ status: "recovered" })
        .where(
          and(
            eq(abandonedCarts.storeId, store.id),
            eq(abandonedCarts.recoveryToken, recoveryToken),
            eq(abandonedCarts.status, "pending")
          )
        )
        .returning({ id: abandonedCarts.id });

      return NextResponse.json({
        saved: true,
        recovered: updated.length > 0,
        id: updated[0]?.id ?? null,
      });
    }

    const customerName = asText(body.customerName);
    const customerPhone = asText(body.customerPhone);
    const customerEmail = asText(body.customerEmail).toLowerCase();
    const phoneDigits = normalizeWhatsAppNumber(customerPhone);
    const items = sanitizeItems(body.items);

    const hasContact = Boolean(customerName || phoneDigits || customerEmail);
    if (items.length === 0 || !hasContact) {
      return NextResponse.json({ saved: false, reason: "INCOMPLETE" });
    }

    // Always derive the snapshot total from the sanitized line items. The
    // client-supplied `totalAmount` is display-only and must not be trusted
    // (it feeds dashboard abandoned/recovered revenue metrics).
    const totalAmount = cartTotal(items).toFixed(2);

    // 1) Same recovery token wins (guest came back through the WhatsApp link).
    if (recoveryToken) {
      const byToken = await db
        .select()
        .from(abandonedCarts)
        .where(
          and(
            eq(abandonedCarts.storeId, store.id),
            eq(abandonedCarts.recoveryToken, recoveryToken)
          )
        )
        .limit(1);

      if (byToken[0]) {
        const existing = byToken[0];
        if (existing.status !== "pending") {
          // Already recovered/expired: start a fresh snapshot with a new token.
          const inserted = await db
            .insert(abandonedCarts)
            .values({
              storeId: store.id,
              customerName,
              customerPhone,
              customerEmail,
              cartItems: items,
              totalAmount,
              status: "pending",
            })
            .returning({
              id: abandonedCarts.id,
              recoveryToken: abandonedCarts.recoveryToken,
              status: abandonedCarts.status,
            });

          const row = inserted[0];
          return NextResponse.json({
            saved: true,
            id: row.id,
            recoveryToken: row.recoveryToken,
            status: row.status,
            itemQuantity: cartQuantity(items),
          });
        }

        const updated = await db
          .update(abandonedCarts)
          .set({
            customerName: customerName || existing.customerName,
            customerPhone: customerPhone || existing.customerPhone,
            customerEmail: customerEmail || existing.customerEmail,
            cartItems: items,
            totalAmount,
          })
          .where(
            and(
              eq(abandonedCarts.id, existing.id),
              eq(abandonedCarts.status, "pending")
            )
          )
          .returning({
            id: abandonedCarts.id,
            recoveryToken: abandonedCarts.recoveryToken,
            status: abandonedCarts.status,
          });

        const row = updated[0];
        return NextResponse.json({
          saved: true,
          id: row.id,
          recoveryToken: row.recoveryToken,
          status: row.status,
          itemQuantity: cartQuantity(items),
        });
      }
    }

    // 2) Returning guest: reuse the latest pending snapshot for this phone/email.
    const matches = [];
    if (customerPhone) matches.push(eq(abandonedCarts.customerPhone, customerPhone));
    if (customerEmail) matches.push(eq(abandonedCarts.customerEmail, customerEmail));

    if (matches.length > 0) {
      const found = await db
        .select()
        .from(abandonedCarts)
        .where(
          and(
            eq(abandonedCarts.storeId, store.id),
            eq(abandonedCarts.status, "pending"),
            or(...matches)
          )
        )
        .orderBy(desc(abandonedCarts.createdAt))
        .limit(1);

      const existing = found[0];
      if (existing) {
        const updated = await db
          .update(abandonedCarts)
          .set({
            customerName: customerName || existing.customerName,
            customerPhone: customerPhone || existing.customerPhone,
            customerEmail: customerEmail || existing.customerEmail,
            cartItems: items,
            totalAmount,
          })
          .where(
            and(
              eq(abandonedCarts.id, existing.id),
              eq(abandonedCarts.status, "pending")
            )
          )
          .returning({
            id: abandonedCarts.id,
            recoveryToken: abandonedCarts.recoveryToken,
            status: abandonedCarts.status,
          });

        const row = updated[0];
        return NextResponse.json({
          saved: true,
          id: row.id,
          recoveryToken: row.recoveryToken,
          status: row.status,
          itemQuantity: cartQuantity(items),
        });
      }
    }

    // 3) Brand new abandoned cart.
    const inserted = await db
      .insert(abandonedCarts)
      .values({
        storeId: store.id,
        customerName,
        customerPhone,
        customerEmail,
        cartItems: items,
        totalAmount,
        status: "pending",
        ...(recoveryToken ? { recoveryToken } : {}),
      })
      .returning({
        id: abandonedCarts.id,
        recoveryToken: abandonedCarts.recoveryToken,
        status: abandonedCarts.status,
      });

    const row = inserted[0];
    return NextResponse.json({
      saved: true,
      id: row.id,
      recoveryToken: row.recoveryToken,
      status: row.status,
      itemQuantity: cartQuantity(items),
    });
  } catch (error) {
    console.error("Save abandoned cart error:", error);
    return createErrorResponse(error, "Failed to save abandoned cart");
  }
}

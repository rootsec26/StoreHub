import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orderStatusLogs, orders, stores } from "@/db/schema";
import {
  shipmentTrackingPath,
  type ShippingStatus,
} from "@/lib/shipping";
import { broadcastOrderUpdate } from "@/lib/realtime";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { sendWhatsAppText } from "@/lib/whatsapp-cloud";
import { absoluteUrl } from "@/lib/site";

/**
 * Carrier status sync — shared by POST /api/shipping/webhook (and future
 * polling jobs).
 *
 * When a carrier reports DELIVERED the engine closes the loop automatically:
 *   order.status = Completed + payment_status = paid → revenue accrual
 *   (analytics read Completed+paid, see src/lib/order-metrics.ts)
 *   + a WhatsApp delivery receipt to the buyer.
 */

const STATUS_RANK: Record<ShippingStatus, number> = {
  UNFULFILLED: 0,
  LABEL_CREATED: 1,
  PICKED_UP: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  RETURNED: 5,
};

export class ShippingWebhookError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "ShippingWebhookError";
  }
}

export interface CarrierStatusUpdate {
  trackingNumber: string;
  status: ShippingStatus;
  rawStatus?: string | null;
  carrier?: string | null;
  location?: string | null;
  eventAt?: string | null;
}

export interface StatusSyncResult {
  applied: boolean;
  changed: boolean;
  delivered: boolean;
  order: typeof orders.$inferSelect;
  previousStatus: string;
}

/** Exact buyer-facing delivery receipt requested by the product spec. */
export function buildDeliveryMessage(orderId: string, trackingUrl?: string | null): string {
  const base = `Your order #${orderId} has been successfully delivered!`;
  return trackingUrl ? `${base}\n${trackingUrl}` : base;
}

/**
 * Applies one carrier status event. Regression events (a DELIVERED shipment
 * reporting OUT_FOR_DELIVERY again) are ignored so webhook deliveries stay
 * idempotent and retries are harmless.
 */
export async function applyCarrierStatusUpdate(
  update: CarrierStatusUpdate
): Promise<StatusSyncResult> {
  const outcome = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(orders)
      .where(eq(orders.trackingNumber, update.trackingNumber))
      .for("update")
      .limit(1);

    if (rows.length === 0) {
      throw new ShippingWebhookError(
        "ORDER_NOT_FOUND",
        "No order matches this tracking number",
        404
      );
    }

    const order = rows[0];
    const currentRank = STATUS_RANK[order.shippingStatus as ShippingStatus] ?? 0;
    const nextRank = STATUS_RANK[update.status];

    if (nextRank < currentRank) {
      return { order, changed: false, delivered: false, previousStatus: order.status };
    }
    if (nextRank === currentRank && currentRank > 0) {
      // Identical event replayed by the carrier — already reflected.
      return { order, changed: false, delivered: false, previousStatus: order.status };
    }

    const values: Partial<typeof orders.$inferInsert> = {
      shippingStatus: update.status,
    };

    let delivered = false;
    if (update.status === "DELIVERED" && order.status !== "Cancelled") {
      delivered = true;
      values.status = "Completed";
      // Lowercase matches orders_payment_status_check + every other writer
      // (POS, Stripe); revenue metrics compare case-insensitively.
      values.paymentStatus = "paid";
    }

    const updated = await tx
      .update(orders)
      .set(values)
      .where(eq(orders.id, order.id))
      .returning();

    return {
      order: updated[0] ?? order,
      changed: true,
      delivered,
      previousStatus: order.status,
    };
  });

  if (!outcome.changed) {
    return {
      applied: false,
      changed: false,
      delivered: false,
      order: outcome.order,
      previousStatus: outcome.previousStatus,
    };
  }

  // Audit trail (best-effort: never rolls back a carrier event).
  if (outcome.order.status !== outcome.previousStatus) {
    try {
      await db.insert(orderStatusLogs).values({
        orderId: outcome.order.id,
        storeId: outcome.order.storeId,
        previousStatus: outcome.previousStatus,
        newStatus: outcome.order.status,
        changedByUserId: null,
        ipAddress: update.carrier ? `carrier:${update.carrier}` : "carrier-webhook",
      });
    } catch (error) {
      console.error("Shipping webhook audit log failed:", error);
    }
  }

  try {
    await broadcastOrderUpdate(outcome.order.storeId, {
      orderId: outcome.order.id,
      status: outcome.order.status,
      customerName: outcome.order.customerName,
      totalAmount: String(outcome.order.totalAmount),
      createdAt: outcome.order.createdAt.toISOString(),
    });
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/shipping-labels");
  } catch (error) {
    console.error("Shipping webhook realtime refresh failed:", error);
  }

  if (outcome.delivered) {
    await notifyDelivery(outcome.order);
  }

  return {
    applied: true,
    changed: true,
    delivered: outcome.delivered,
    order: outcome.order,
    previousStatus: outcome.previousStatus,
  };
}

/** Best-effort WhatsApp delivery receipt (skipped when unconfigured). */
async function notifyDelivery(order: typeof orders.$inferSelect): Promise<void> {
  try {
    const to = normalizeWhatsAppNumber(order.customerPhone);
    if (!to) return;

    const rows = await db
      .select({ slug: stores.slug })
      .from(orders)
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .where(eq(orders.id, order.id))
      .limit(1);
    const slug = rows[0]?.slug;
    if (!slug) return;

    const trackingUrl = absoluteUrl(shipmentTrackingPath(slug, order.id));
    await sendWhatsAppText(to, buildDeliveryMessage(order.id, trackingUrl));
  } catch (error) {
    console.error("Delivery WhatsApp notification failed:", error);
  }
}

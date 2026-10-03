import { db } from "@/db";
import { orders, orderItems, products, stores, orderStatusLogs } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  buildWhatsAppOrderText,
  normalizeWhatsAppNumber,
  type WhatsAppOrderItem,
} from "@/lib/whatsapp";
import type { Locale } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/locale";
import {
  sendWhatsAppPayload,
  whatsappApiConfigured,
} from "@/lib/whatsapp-cloud";
import { isValidTransition } from "@/lib/order-state-machine";
import type { OrderStatus } from "@/lib/types";
import { getVerificationTtlHours } from "@/lib/orders/risk-engine";
import {
  COD_REPLY_CANCEL_PREFIX,
  COD_REPLY_CONFIRM_PREFIX,
  buildCodVerificationUrl,
  isCodOrder,
  type CodDecision,
} from "@/lib/orders/cod-shared";

export {
  COD_PAYMENT_METHODS,
  COD_REPLY_CANCEL_PREFIX,
  COD_REPLY_CONFIRM_PREFIX,
  buildCodVerificationUrl,
  isCodOrder,
} from "@/lib/orders/cod-shared";
export type { CodDecision, CodVerificationStatus } from "@/lib/orders/cod-shared";

/**
 * Smart COD Verification engine.
 *
 * 1. A COD order is created → the buyer gets an interactive WhatsApp message
 *    (Confirm / Cancel buttons) plus a fallback short link.
 * 2. The buyer taps a button (WhatsApp webhook), opens the short link, or the
 *    merchant resends the message from the dashboard.
 * 3. `POST /api/orders/verify-cod` flips the order to VERIFIED / cancelled.
 */

const CONFIRM_LABEL: Record<Locale, string> = {
  en: "Confirm Order",
  ar: "تأكيد الطلب",
};
const CANCEL_LABEL: Record<Locale, string> = {
  en: "Cancel Order",
  ar: "إلغاء الطلب",
};
const MESSAGE_HEADLINE: Record<Locale, string> = {
  en: "Confirm your Cash on Delivery order",
  ar: " أكد طلبك بالدفع عند الاستلام",
};
const BUTTON_HINT: Record<Locale, string> = {
  en: "Tap Confirm to process your order, or Cancel to stop it. If the buttons do not appear, open the link below:",
  ar: "اضغط على تأكيد لتجهيز طلبك أو إلغاء لإيقافه. إذا لم تظهر الأزرار، افتح الرابط أدناه:",
};

export function codReplyId(decision: CodDecision, orderId: string): string {
  return decision === "CONFIRMED"
    ? `${COD_REPLY_CONFIRM_PREFIX}${orderId}`
    : `${COD_REPLY_CANCEL_PREFIX}${orderId}`;
}

export function parseCodReplyId(replyId: string): {
  decision: CodDecision;
  orderId: string;
} | null {
  if (replyId.startsWith(COD_REPLY_CONFIRM_PREFIX)) {
    return { decision: "CONFIRMED", orderId: replyId.slice(COD_REPLY_CONFIRM_PREFIX.length) };
  }
  if (replyId.startsWith(COD_REPLY_CANCEL_PREFIX)) {
    return { decision: "CANCELLED", orderId: replyId.slice(COD_REPLY_CANCEL_PREFIX.length) };
  }
  return null;
}

export interface CodVerificationMessage {
  text: string;
  verifyUrl: string;
}

export function buildCodVerificationText(params: {
  storeName: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: WhatsAppOrderItem[];
  total: number;
  verifyUrl: string;
  locale: Locale;
}): CodVerificationMessage {
  const { locale, verifyUrl } = params;
  const summary = buildWhatsAppOrderText(
    {
      storeName: params.storeName,
      orderId: params.orderId,
      items: params.items,
      total: params.total,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerAddress: params.customerAddress,
    },
    locale
  );

  const text = [
    summary,
    "",
    `*${MESSAGE_HEADLINE[locale]}*`,
    BUTTON_HINT[locale],
    verifyUrl,
  ].join("\n");

  return { text, verifyUrl };
}

/** Meta Cloud API style interactive button message (Confirm / Cancel). */
export function buildCodInteractivePayload(params: {
  to: string;
  text: string;
  orderId: string;
  locale: Locale;
}): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.text },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: codReplyId("CONFIRMED", params.orderId), title: CONFIRM_LABEL[params.locale] },
          },
          {
            type: "reply",
            reply: { id: codReplyId("CANCELLED", params.orderId), title: CANCEL_LABEL[params.locale] },
          },
        ],
      },
    },
  };
}

export interface CodVerificationSendResult {
  delivered: boolean;
  channel: "whatsapp_api" | "fallback_link";
  verifyUrl: string;
  waMeUrl: string | null;
  error?: string;
}

/**
 * Loads the order + store + line items, renders the verification message and
 * pushes it to the configured WhatsApp provider. When no provider is
 * configured (or the send fails) the fallback short link is returned so the
 * merchant can still share it manually.
 */
export async function triggerCodVerification(
  orderId: string,
  options: { locale?: Locale; origin?: string } = {}
): Promise<CodVerificationSendResult | null> {
  const rows = await db
    .select({ order: orders, store: stores })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (rows.length === 0) return null;

  const { order, store } = rows[0];
  const verifyUrl = buildCodVerificationUrl(store.slug, order.id, options.origin);
  const to = normalizeWhatsAppNumber(order.customerPhone);
  const waMeUrl = to
    ? `https://wa.me/${to}`
    : null;

  if (!to) {
    return {
      delivered: false,
      channel: "fallback_link",
      verifyUrl,
      waMeUrl: null,
      error: "Customer phone number missing",
    };
  }

  const items = await db
    .select({
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      productName: products.name,
    })
    .from(orderItems)
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, order.id));

  const whatsappItems: WhatsAppOrderItem[] = items.map((item) => ({
    name: item.productName || "Item",
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice) || 0,
  }));

  const locale = options.locale ?? DEFAULT_LOCALE;
  const message = buildCodVerificationText({
    storeName: store.name,
    orderId: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone || "",
    customerAddress: order.customerAddress || "",
    items: whatsappItems,
    total: Number(order.totalAmount) || 0,
    verifyUrl,
    locale,
  });

  const base: CodVerificationSendResult = {
    delivered: false,
    channel: "fallback_link",
    verifyUrl,
    waMeUrl,
  };

  // Restart the EXPIRED timeout for this dispatch (works for first send too).
  await db
    .update(orders)
    .set({ verificationSentAt: new Date() })
    .where(eq(orders.id, order.id));

  if (!whatsappApiConfigured()) {
    return { ...base, error: "WhatsApp provider not configured" };
  }

  try {
    const payload = buildCodInteractivePayload({
      to,
      text: message.text,
      orderId: order.id,
      locale,
    });
    await sendWhatsAppPayload(payload);
    return { ...base, delivered: true, channel: "whatsapp_api" };
  } catch (error) {
    console.error("COD verification message failed:", error);
    return {
      ...base,
      error: error instanceof Error ? error.message : "WhatsApp send failed",
    };
  }
}

export class CodVerificationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "CodVerificationError";
  }
}

export interface CodDecisionResult {
  order: typeof orders.$inferSelect;
  changed: boolean;
  /** Status before the decision (used for the best-effort audit trail). */
  previousStatus?: string;
  storeId: string;
}

/**
 * Applies the buyer's Confirm / Cancel decision atomically:
 *  CONFIRMED → cod_verification_status = VERIFIED, status = Confirmed, verified_at logged.
 *  CANCELLED → order cancelled (+ stock restocked), verification closed as EXPIRED.
 */
export async function applyCodVerificationDecision(params: {
  orderId: string;
  decision: CodDecision;
  ipAddress?: string;
}): Promise<CodDecisionResult> {
  const { orderId, decision, ipAddress } = params;

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    if (rows.length === 0) {
      throw new CodVerificationError("ORDER_NOT_FOUND", "Order not found", 404);
    }

    const order = rows[0];
    if (!isCodOrder(order)) {
      throw new CodVerificationError(
        "NOT_COD",
        "Order does not require COD verification",
        400
      );
    }

    if (decision === "CONFIRMED") {
      if (order.codVerificationStatus === "VERIFIED") {
        return { order, changed: false, storeId: order.storeId };
      }

      const nextStatus = order.status === "Pending" ? "Confirmed" : order.status;
      const updated = await tx
        .update(orders)
        .set({
          codVerificationStatus: "VERIFIED",
          verifiedAt: new Date(),
          status: nextStatus,
        })
        .where(eq(orders.id, orderId))
        .returning();

      return {
        order: updated[0],
        changed: true,
        previousStatus: order.status,
        storeId: order.storeId,
      };
    }

    // CANCELLED
    if (order.status === "Cancelled") {
      const updated = await tx
        .update(orders)
        .set({ codVerificationStatus: "EXPIRED" })
        .where(eq(orders.id, orderId))
        .returning();
      return { order: updated[0], changed: false, storeId: order.storeId };
    }

    if (!isValidTransition(order.status as OrderStatus, "Cancelled", false)) {
      throw new CodVerificationError(
        "INVALID_STATUS",
        "This order can no longer be cancelled",
        409
      );
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    for (const item of items) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(eq(products.id, item.productId));
    }

    const updated = await tx
      .update(orders)
      .set({ status: "Cancelled", codVerificationStatus: "EXPIRED" })
      .where(eq(orders.id, orderId))
      .returning();

    return {
      order: updated[0],
      changed: true,
      previousStatus: order.status,
      storeId: order.storeId,
    };
  });

  // Best-effort audit trail (written after commit so a missing/broken
  // `order_status_logs` table can never roll back a verification decision).
  if (result.changed && result.previousStatus && result.previousStatus !== result.order.status) {
    try {
      await db.insert(orderStatusLogs).values({
        orderId,
        storeId: result.storeId,
        previousStatus: result.previousStatus,
        newStatus: result.order.status,
        changedByUserId: null,
        ipAddress: ipAddress ?? "whatsapp-verification",
      });
    } catch (error) {
      console.error("COD verification audit log failed:", error);
    }
  }

  return result;
}

/** Closes verifications that were never answered within the TTL window. */
export async function expireStaleCodVerifications(storeId: string): Promise<void> {
  const hours = Math.max(1, Math.floor(getVerificationTtlHours()));
  await db
    .update(orders)
    .set({ codVerificationStatus: "EXPIRED" })
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.codVerificationStatus, "PENDING_VERIFICATION"),
        lt(
          sql`coalesce(${orders.verificationSentAt}, ${orders.createdAt})`,
          sql`now() - make_interval(hours => ${hours})`
        )
      )
    );
}

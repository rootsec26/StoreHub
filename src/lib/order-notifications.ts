import { db } from "@/db";
import { notifications, notificationRecipients } from "@/db/schema";
import { orderTrackingCode } from "@/lib/order-tracking";
import { normalizePhoneDigits } from "@/lib/order-tracking";

interface OrderNotificationInput {
  storeId: string;
  storeSlug: string;
  storeName: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string;
  currency: string;
}

/**
 * Drops an in-app inbox notification for a guest shopper as soon as their
 * order is placed, carrying the short tracking code and a direct link to the
 * store's tracking page. Identity is the checkout phone number — the same
 * trust model as `/api/storefront/orders/track` and the notifications inbox.
 * Never throws: notification delivery must not break checkout.
 */
export async function notifyCustomerOrderPlaced(
  input: OrderNotificationInput
): Promise<void> {
  try {
    const phone = input.customerPhone.trim();
    if (!phone) return;

    const digits = normalizePhoneDigits(phone);
    if (digits.length < 6) return;

    const code = orderTrackingCode(input.orderId);
    const trackPath = `/store/${input.storeSlug}/track-order?id=${encodeURIComponent(input.orderId)}`;
    const now = new Date();

    const [notification] = await db
      .insert(notifications)
      .values({
        scope: "MERCHANT_TO_CUSTOMER",
        storeId: input.storeId,
        senderType: "MERCHANT",
        title: `Order confirmed — ${code}`,
        body: `Hi ${input.customerName || "there"}, your order ${code} at ${input.storeName} was placed successfully. Total: ${input.totalAmount} ${input.currency}. Track it anytime at ${trackPath}`,
        category: "ORDER_UPDATE",
        priority: "NORMAL",
        channel: "IN_APP",
        status: "SENT",
        audienceType: "SELECTED_CUSTOMERS",
        audienceFilter: {},
        sentAt: now,
        recipientCount: 1,
        deliveredCount: 1,
      })
      .returning({ id: notifications.id });

    await db.insert(notificationRecipients).values({
      notificationId: notification.id,
      recipientKey: `customer:phone:${digits}`,
      recipientType: "CUSTOMER",
      storeId: input.storeId,
      recipientName: input.customerName || "",
      recipientPhone: phone,
      channel: "IN_APP",
      status: "SENT",
      sentAt: now,
      deliveredAt: now,
    });
  } catch (error) {
    console.error("[order-notifications] failed:", error);
  }
}

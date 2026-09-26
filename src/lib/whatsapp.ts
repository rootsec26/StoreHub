import type { Locale } from "@/lib/i18n";

export interface WhatsAppOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface WhatsAppOrderDetails {
  storeName: string;
  orderId: string;
  items: WhatsAppOrderItem[];
  total: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes?: string;
}

interface MessageLabels {
  newOrder: string;
  orderId: string;
  items: string;
  total: string;
  customer: string;
  phone: string;
  address: string;
  notes: string;
}

const LABELS: Record<Locale, MessageLabels> = {
  en: {
    newOrder: "New Order",
    orderId: "Order ID",
    items: "Items",
    total: "Total",
    customer: "Customer",
    phone: "Phone",
    address: "Address",
    notes: "Notes",
  },
  ar: {
    newOrder: "طلب جديد",
    orderId: "رقم الطلب",
    items: "المنتجات",
    total: "الإجمالي",
    customer: "العميل",
    phone: "الهاتف",
    address: "العنوان",
    notes: "ملاحظات",
  },
};

function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `EGP ${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Normalises a stored phone number into digits for `wa.me`.
 * Egyptian local numbers (`01 …`) are promoted to the `20` country code since
 * the platform prices everything in EGP; international `+`/`00` prefixes are
 * stripped. Returns "" when no dialable number is available.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined
): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

/** Human readable, WhatsApp-formatted order summary (supports *bold*). */
export function buildWhatsAppOrderText(
  order: WhatsAppOrderDetails,
  locale: Locale
): string {
  const labels = LABELS[locale];
  const lines: string[] = [];

  lines.push(`*${labels.newOrder} — ${order.storeName}*`);
  lines.push("------------------------------");
  lines.push(`*${labels.orderId}:* ${order.orderId}`);
  lines.push("");
  lines.push(`*${labels.items}:*`);

  order.items.forEach((item, index) => {
    const lineTotal = item.unitPrice * item.quantity;
    lines.push(
      `${index + 1}. ${item.name}`,
      `   ${item.quantity} × ${money(item.unitPrice)} = ${money(lineTotal)}`
    );
  });

  lines.push("");
  lines.push(`*${labels.total}:* ${money(order.total)}`);
  lines.push(`*${labels.customer}:* ${order.customerName}`);
  if (order.customerPhone) lines.push(`*${labels.phone}:* ${order.customerPhone}`);
  if (order.customerAddress) {
    lines.push(`*${labels.address}:* ${order.customerAddress}`);
  }
  if (order.notes) lines.push(`*${labels.notes}:* ${order.notes}`);

  return lines.join("\n");
}

/** `https://wa.me/{phone}?text=…` or `null` when the store has no number. */
export function buildWhatsAppOrderUrl(
  phone: string | null | undefined,
  text: string
): string | null {
  const digits = normalizeWhatsAppNumber(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

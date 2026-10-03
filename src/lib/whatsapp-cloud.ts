/**
 * Thin WhatsApp Cloud API client shared by every outbound message
 * (COD verification, delivery notifications, ...).
 *
 * Configuration:
 *   WHATSAPP_API_URL   – provider endpoint (Graph API compatible)
 *   WHATSAPP_API_TOKEN – bearer token
 */

export function whatsappApiConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN);
}

/** Posts one Cloud API payload; throws on non-2xx so callers can log/fallback. */
export async function sendWhatsAppPayload(payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(process.env.WHATSAPP_API_URL as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`WhatsApp API ${response.status}: ${body.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Simple text message helper (fire-and-forget safe: never throws upward). */
export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  if (!to || !whatsappApiConfigured()) return false;
  try {
    await sendWhatsAppPayload({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    });
    return true;
  } catch (error) {
    console.error("WhatsApp text message failed:", error);
    return false;
  }
}

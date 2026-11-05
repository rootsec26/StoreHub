import { PaywallError, sendMeteredWhatsApp } from "@/lib/paywall";
import {
  sendWhatsAppText,
  whatsappApiConfigured,
} from "@/lib/whatsapp-cloud";

export interface DeliveryResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  errorCode: string | null;
  errorMessage: string | null;
  creditsRemaining: number | null;
}

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Delivers one merchant -> customer message through the existing metered
 * WhatsApp path. Never throws: provider/paywall failures become a typed result
 * so a single bad recipient can never abort a campaign batch.
 */
export async function deliverWhatsAppMessage(input: {
  storeId: string;
  phone: string;
  title: string;
  body: string;
}): Promise<DeliveryResult> {
  if (!whatsappApiConfigured()) {
    return {
      status: "SKIPPED",
      errorCode: "WHATSAPP_NOT_CONFIGURED",
      errorMessage:
        "WhatsApp Cloud API is not configured (WHATSAPP_API_URL / WHATSAPP_API_TOKEN).",
      creditsRemaining: null,
    };
  }

  try {
    const outcome = await sendMeteredWhatsApp(
      input.storeId,
      `Customer message: ${input.title}`,
      () => sendWhatsAppText(input.phone, `${input.title}\n\n${input.body}`),
      { isDelivered: (accepted) => accepted === true }
    );

    if (outcome.delivered) {
      return {
        status: "SENT",
        errorCode: null,
        errorMessage: null,
        creditsRemaining: outcome.creditsRemaining,
      };
    }

    return {
      status: "FAILED",
      errorCode: "WHATSAPP_SEND_FAILED",
      errorMessage: "The WhatsApp provider did not accept the message.",
      creditsRemaining: outcome.creditsRemaining,
    };
  } catch (error) {
    if (error instanceof PaywallError) {
      return {
        status: "SKIPPED",
        errorCode: error.code,
        errorMessage: truncate(error.message),
        creditsRemaining: null,
      };
    }

    return {
      status: "FAILED",
      errorCode: "WHATSAPP_ERROR",
      errorMessage: truncate(
        error instanceof Error ? error.message : "Unknown WhatsApp error"
      ),
      creditsRemaining: null,
    };
  }
}

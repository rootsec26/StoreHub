/**
 * Manual (off-platform) payment configuration stored as JSON inside
 * `stores.manual_payment_instructions`. Shared by the merchant settings UI,
 * onboarding and the public checkout page so every surface parses the same
 * shape.
 */

export interface ManualPaymentConfig {
  vodafoneCashNumber: string;
  instaPayNumber: string;
  /** Free-text extra wallets / transfer details ("أي وسائل أخرى"). */
  otherMethods: string;
  instructions: string;
  cashOnDeliveryEnabled: boolean;
}

export const EMPTY_MANUAL_PAYMENT_CONFIG: ManualPaymentConfig = {
  vodafoneCashNumber: "",
  instaPayNumber: "",
  otherMethods: "",
  instructions: "",
  cashOnDeliveryEnabled: true,
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Parses the raw `manual_payment_instructions` column. Legacy rows hold a
 * plain-text instruction blob instead of JSON — those become `instructions`.
 */
export function parseManualPaymentConfig(
  raw: string | null | undefined
): ManualPaymentConfig {
  const value = (raw ?? "").trim();
  if (!value) return { ...EMPTY_MANUAL_PAYMENT_CONFIG };

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        vodafoneCashNumber: asString(parsed.vodafoneCashNumber).trim(),
        instaPayNumber: asString(parsed.instaPayNumber).trim(),
        otherMethods: asString(parsed.otherMethods).trim(),
        instructions: asString(parsed.instructions).trim(),
        cashOnDeliveryEnabled: parsed.cashOnDeliveryEnabled !== false,
      };
    }
  } catch {
    // Legacy free-text instructions.
  }

  return {
    ...EMPTY_MANUAL_PAYMENT_CONFIG,
    instructions: value,
  };
}

/** Serializes the config back into the JSON blob the column stores. */
export function serializeManualPaymentConfig(
  config: ManualPaymentConfig
): string {
  return JSON.stringify({
    vodafoneCashNumber: config.vodafoneCashNumber.trim(),
    instaPayNumber: config.instaPayNumber.trim(),
    otherMethods: config.otherMethods.trim(),
    instructions: config.instructions.trim(),
    cashOnDeliveryEnabled: config.cashOnDeliveryEnabled,
  });
}

/** True when the merchant configured at least one way to get paid manually. */
export function hasManualPaymentDetails(config: ManualPaymentConfig): boolean {
  return Boolean(
    config.vodafoneCashNumber ||
      config.instaPayNumber ||
      config.otherMethods ||
      config.instructions
  );
}

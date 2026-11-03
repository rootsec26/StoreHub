import { PHONE_PATTERN } from "@/lib/order-tracking";

// Allowed contact types for price alerts.
export type AlertContactType = "email" | "phone";

/**
 * Normalize and classify a shopper-provided contact string.
 * Returns null when the value is not a usable email or phone.
 */
export function classifyContact(raw: string): AlertContactType | null {
  const value = raw.trim();
  if (!value) return null;

  // Email: simple but strict enough for this feature.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "email";
  }

  // Phone: reuse the storefront phone validity check, then normalize to digits.
  if (PHONE_PATTERN.test(value)) {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 6 && digits.length <= 15) {
      return "phone";
    }
  }

  return null;
}

/**
 * Return the canonical stored value for a contact.
 * - emails: lowercased
 * - phones: digits only (E.164-friendly), kept as the storefront already accepts
 *   formatted input.
 */
export function canonicalContactValue(type: AlertContactType, raw: string): string {
  const value = raw.trim();
  if (type === "email") {
    return value.toLowerCase();
  }
  return value.replace(/\D/g, "");
}

/**
 * Rejection reason returned by the storefront alert endpoint when the request
 * is invalid.
 */
export interface AlertValidationError {
  code: "INVALID_CONTACT" | "EMPTY_CONTACT";
  message: string;
}

export function validateAlertContact(raw: string): AlertContactType | AlertValidationError {
  if (!raw || raw.trim().length === 0) {
    return { code: "EMPTY_CONTACT", message: "Please enter a phone number or email." };
  }
  const type = classifyContact(raw);
  if (!type) {
    return {
      code: "INVALID_CONTACT",
      message: "Enter a valid email address or phone number.",
    };
  }
  return type;
}

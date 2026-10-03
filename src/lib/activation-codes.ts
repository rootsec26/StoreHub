import {
  ACTIVATION_CODE_SPECS,
  type ActivationCodeType,
} from "@/lib/billing-packages";

/** Voucher lifecycle shown in the Super Admin panel. */
export type ActivationCodeStatus = "available" | "used" | "expired";

export interface ActivationCodeDTO {
  id: string;
  code: string;
  type: string;
  label: string;
  creditAmount: number | null;
  planDays: number;
  status: ActivationCodeStatus;
  expiresAt: string | null;
  usedAt: string | null;
  usedByStoreId: string | null;
  createdAt: string;
}

/** Ambiguous characters (0/O/1/I) are excluded so codes read cleanly. */
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCodePart(length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  }
  return out;
}

/** `AI500-X82A-99LK` style voucher built from a product prefix. */
export function generateActivationCode(prefix: string): string {
  return `${prefix}-${randomCodePart()}-${randomCodePart()}`;
}

export function activationCodeStatus(
  record: { isUsed: boolean; expiresAt: Date | string | null },
  now: Date = new Date()
): ActivationCodeStatus {
  if (record.isUsed) return "used";
  if (
    record.expiresAt &&
    new Date(record.expiresAt).getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return "available";
}

export function activationCodeLabel(type: string): string {
  return type in ACTIVATION_CODE_SPECS
    ? ACTIVATION_CODE_SPECS[type as ActivationCodeType].label
    : type;
}

export function isCustomCodeValid(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code);
}

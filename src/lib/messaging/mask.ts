/**
 * Masks a phone number for admin-facing logs: keeps only the last four digits
 * so support can correlate a delivery row without exposing customer contacts.
 */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"•".repeat(Math.min(6, digits.length - 4))}${digits.slice(-4)}`;
}

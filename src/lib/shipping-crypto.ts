import crypto from "crypto";

/**
 * AES-256-GCM envelope for carrier credentials stored in
 * `shipping_integrations.api_key` / `api_secret`.
 *
 * Encoded form: `v1.<iv-b64>.<tag-b64>.<cipher-b64>`.
 * The key is derived (HKDF-style) from SHIPPING_ENCRYPTION_KEY when set,
 * falling back to JWT_SECRET so a fresh environment works out of the box.
 * Values that are not in the envelope format are returned untouched so
 * legacy plaintext rows keep working.
 */

const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret =
    process.env.SHIPPING_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "storehub-shipping-fallback-key";
  return crypto
    .createHash("sha256")
    .update(`storehub:shipping:${secret}`)
    .digest();
}

export function encryptSecret(plain: string | null | undefined): string {
  if (!plain) return "";
  if (plain.startsWith(`${VERSION}.`)) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith(`${VERSION}.`)) return stored;

  const parts = stored.split(".");
  if (parts.length !== 4) return "";

  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const payload = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("Failed to decrypt carrier credential:", error);
    return "";
  }
}

/** `••••1234` style mask for API responses — never expose raw secrets. */
export function maskSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  const plain = decryptSecret(stored);
  if (!plain) return "";
  const tail = plain.slice(-4);
  return `••••${tail}`;
}

/** True when the value looks like an encrypted envelope. */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(`${VERSION}.`));
}

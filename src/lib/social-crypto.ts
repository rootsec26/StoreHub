import crypto from "crypto";

/**
 * AES-256-GCM envelope for social platform credentials stored in
 * `social_channels.access_token` / `social_channels.page_id`.
 *
 * Encoded form: `v1.<iv-b64>.<tag-b64>.<cipher-b64>` (same wire format as
 * src/lib/shipping-crypto.ts but with an isolated key context so the two
 * secret families never decrypt each other).
 *
 * The key is derived from SOCIAL_ENCRYPTION_KEY when set, falling back to
 * JWT_SECRET so a fresh environment works out of the box. Values not in the
 * envelope format are returned untouched for backwards compatibility.
 */

const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret =
    process.env.SOCIAL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "storehub-social-fallback-key";
  return crypto.createHash("sha256").update(`storehub:social:${secret}`).digest();
}

export function encryptSocialSecret(plain: string | null | undefined): string {
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

export function decryptSocialSecret(stored: string | null | undefined): string {
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
    console.error("Failed to decrypt social credential:", error);
    return "";
  }
}

/** `••••1234` style mask — never expose raw tokens in API responses. */
export function maskSocialSecret(stored: string | null | undefined): string {
  const plain = decryptSocialSecret(stored);
  if (!plain) return "";
  return `••••${plain.slice(-4)}`;
}

/** Non-reversible lookup key for the plaintext page id (webhook routing). */
export function hashPageId(pageId: string | null | undefined): string {
  if (!pageId) return "";
  return crypto.createHash("sha256").update(pageId.trim()).digest("hex");
}

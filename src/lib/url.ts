export const LOCAL_FALLBACK_URL = "http://localhost:3000";

const SCHEME_RE = /^[a-z][a-z0-9+\-.]*:\/\//i;
const LOOPBACK_RE = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

export function cleanUrlInput(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";

  let value = raw.trim();
  // Drop accidental `NAME=` / `=` prefixes left by pasted .env fragments
  // (e.g. `="https://..."`), which would otherwise corrupt the URL.
  value = value.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=|=+)/, "").trim();
  // Strip wrapping quotes — paired or stray.
  value = value.replace(/^["']+|["']+$/g, "");

  return value.trim();
}

export function ensureProtocol(
  value: string,
  protocol: "http" | "https" = "https"
): string {
  if (!value) return "";
  if (SCHEME_RE.test(value)) return value;
  if (value.startsWith("//")) return `${protocol}:${value}`;
  return `${protocol}://${value}`;
}

export function ensureScheme(value: string, scheme: string): string {
  if (!value) return "";
  if (value.includes("://")) return value;
  return `${scheme}://${value}`;
}

export function safeParseUrl(
  raw: string | null | undefined,
  protocol: "http" | "https" = "https"
): URL | null {
  const cleaned = cleanUrlInput(raw);
  if (!cleaned) return null;

  if (SCHEME_RE.test(cleaned)) return tryParseUrl(cleaned);

  const preferHttp = protocol === "http" || LOOPBACK_RE.test(cleaned);
  const candidates = preferHttp
    ? [`http://${cleaned}`, `https://${cleaned}`]
    : [`https://${cleaned}`, `http://${cleaned}`];

  for (const candidate of candidates) {
    const parsed = tryParseUrl(candidate);
    if (parsed) return parsed;
  }

  return null;
}

export function urlToString(url: URL): string {
  return url.toString().replace(/\/+$/, "");
}

export function safeUrl(
  raw: string | null | undefined,
  fallback: string = LOCAL_FALLBACK_URL
): URL {
  return safeParseUrl(raw) ?? safeParseUrl(fallback) ?? new URL(LOCAL_FALLBACK_URL);
}

export function safeUrlString(
  raw: string | null | undefined,
  fallback: string = LOCAL_FALLBACK_URL
): string {
  return urlToString(safeUrl(raw, fallback)) || LOCAL_FALLBACK_URL;
}

export function safeResolveUrl(
  path: string,
  base: string | URL | null | undefined
): URL | null {
  if (!path) return null;

  const baseUrl =
    base instanceof URL ? base : tryParseUrl(cleanUrlInput(base));
  if (!baseUrl) return null;

  try {
    return new URL(path, baseUrl);
  } catch {
    return null;
  }
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

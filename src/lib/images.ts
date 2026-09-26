import { cleanUrlInput, safeParseUrl } from "@/lib/url";

const SUPABASE_HOST = (() => {
  const parsed = safeParseUrl(cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_URL));
  if (!parsed) return null;
  return parsed.hostname.toLowerCase();
})();

const EXTRA_HOSTS = (process.env.NEXT_PUBLIC_IMAGE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function isAllowlistedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === SUPABASE_HOST) return true;
  if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) return true;
  return EXTRA_HOSTS.includes(host);
}

/**
 * Remote images go through the Next.js optimizer only when their host is on
 * the allowlist. Anything else (owner-pasted URLs, SVGs) renders unoptimized
 * so previews never break, while Supabase assets stay fully optimized.
 */
export function canOptimizeImage(src: string | null | undefined): boolean {
  if (!src) return false;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return true;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.pathname.toLowerCase().endsWith(".svg")) return false;

  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && !isLocal) return false;

  return isAllowlistedHost(url.hostname);
}

import { SignJWT } from "jose";
import "server-only";
import { cleanUrlInput, ensureProtocol, safeParseUrl, urlToString } from "@/lib/url";

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  projectRef: string;
}

/**
 * Public Supabase connection settings (safe to expose to the browser).
 * Returns `null` when the project has not been configured yet.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const anonKey = cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const url = ensureProtocol(
    cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_URL),
    "https"
  );

  if (!url || !anonKey) return null;

  const parsed = safeParseUrl(url);
  if (!parsed) return null;

  return {
    url: urlToString(parsed),
    anonKey,
    projectRef: parsed.hostname.split(".")[0],
  };
}

/**
 * Mints a short-lived Supabase-compatible JWT for one of *our* users.
 *
 * The token carries `role=authenticated` and `sub={user.id}`, which lets
 * Supabase Storage / PostgREST / Realtime evaluate our RLS policies with
 * `auth.uid()` pointing at the app's `users.id` — so every tenant can only
 * touch `store_id/*` paths and their own `orders` rows.
 */
export async function mintSupabaseAccessToken(
  userId: string,
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): Promise<string | null> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const config = getSupabaseConfig();

  if (!jwtSecret || !config) return null;

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    role: "authenticated",
    aud: "authenticated",
    iss: "supabase",
    ref: config.projectRef,
  })
    .setSubject(userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(new TextEncoder().encode(jwtSecret));
}

export function isSupabaseTokenConfigured(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET && getSupabaseConfig());
}

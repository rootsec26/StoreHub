"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TOKEN_TTL_MS = 45 * 60 * 1000;

interface TokenCache {
  token: string | null;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let tokenRequest: Promise<string | null> | null = null;
let browserClient: SupabaseClient | null = null;

/** Drops the cached tenant token (e.g. after a 401 from Supabase). */
export function invalidateSupabaseToken(): void {
  tokenCache = null;
}

/**
 * Fetches a short-lived Supabase JWT minted for the logged-in app user.
 * Returns `null` when the Supabase JWT secret is not configured server-side.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  if (!tokenRequest) {
    tokenRequest = fetch("/api/supabase/token")
      .then(async (res) => {
        if (res.status === 401) return null;
        if (!res.ok) return null;
        const data: { token?: string; expiresIn?: number } = await res.json();
        if (!data.token) return null;

        tokenCache = {
          token: data.token,
          expiresAt: Date.now() + Math.min((data.expiresIn ?? 3600) * 1000, TOKEN_TTL_MS),
        };
        return data.token;
      })
      .catch(() => null)
      .finally(() => {
        tokenRequest = null;
      });
  }

  return tokenRequest;
}

/**
 * Supabase browser client authenticated as the logged-in tenant.
 *
 * `accessToken` opts out of supabase-js's own auth stack and instead sends the
 * minted token on every Storage/PostgREST/Realtime request, which is what makes
 * RLS (`auth.uid()`) resolve to the app user.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    );
  }

  browserClient = createClient(url, anonKey, {
    accessToken: async () => getSupabaseAccessToken(),
  });

  return browserClient;
}

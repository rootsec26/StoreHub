"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanUrlInput, ensureProtocol, safeParseUrl, urlToString } from "@/lib/url";
import { getSiteUrl } from "@/lib/site";

let oauthClient: SupabaseClient | null = null;

/**
 * Dedicated Supabase client for the Google OAuth flow.
 *
 * PKCE is required so the authorization `code` returned to the callback can
 * be exchanged server-verifiably; the code verifier lives in this webview's
 * storage, so the same client must be used for both `signInWithOAuth` and
 * `exchangeCodeForSession`.
 */
export function getSupabaseOAuthClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (oauthClient) return oauthClient;

  const url = ensureProtocol(
    cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_URL),
    "https"
  );
  const anonKey = cleanUrlInput(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) return null;

  const parsed = safeParseUrl(url);
  if (!parsed) return null;

  try {
    oauthClient = createClient(urlToString(parsed), anonKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true },
    });
  } catch {
    return null;
  }

  return oauthClient;
}

export const OAUTH_CALLBACK_PATH = "/auth/callback";

/** Custom URL schemes registered by the native app shells. */
export const OAUTH_DEEP_LINK_SCHEMES = {
  tauri: "storehub",
  android: "com.storehub.app",
} as const;

function sanitizeNextPath(value: string | null | undefined): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 500
  ) {
    return value;
  }
  return "/";
}

/** Native shell identifiers usable as a `?shell=` marker on the web callback. */
export type OAuthShell = "tauri" | "android";

const SHELL_SCHEMES: Record<OAuthShell, string> = {
  tauri: OAUTH_DEEP_LINK_SCHEMES.tauri,
  android: OAUTH_DEEP_LINK_SCHEMES.android,
};

/**
 * Custom-scheme callback URL for a native shell, e.g.
 * `storehub://auth/callback?next=…` or `com.storehub.app://auth/callback?next=…`.
 */
export function getOAuthDeepLinkUrl(
  shell: OAuthShell,
  redirectPath = "/"
): string {
  const next = encodeURIComponent(sanitizeNextPath(redirectPath));
  return `${SHELL_SCHEMES[shell]}://auth/callback?next=${next}`;
}

/**
 * Builds the `redirectTo` URL for `signInWithOAuth`.
 *
 * Native shells are temporarily disabled, so every runtime uses the standard
 * web callback: `https://<origin>/auth/callback?next=…`.
 *
 * The callback MUST stay on the origin that started the flow — the PKCE
 * verifier is origin-scoped. It must be allow-listed in the Supabase
 * dashboard (Authentication → URL Configuration → Redirect URLs).
 */
export function getOAuthRedirectUrl(redirectPath = "/"): string | null {
  if (typeof window === "undefined") return null;

  const next = encodeURIComponent(sanitizeNextPath(redirectPath));
  // Environment-aware origin: resolves to the current origin in the browser
  // (local dev, Vercel previews, production, storefront domains) and to the
  // configured site URL elsewhere.
  const origin = getSiteUrl();

  return `${origin}${OAUTH_CALLBACK_PATH}?next=${next}`;
}

/**
 * True when `raw` is an OAuth callback delivered over a custom app scheme
 * (`storehub://auth/callback…` / `com.storehub.app://auth/callback…`).
 */
export function isOAuthDeepLink(raw: string): boolean {
  try {
    const url = new URL(raw);
    const scheme = url.protocol.replace(/:$/, "");
    const allowed =
      scheme === OAUTH_DEEP_LINK_SCHEMES.tauri ||
      scheme === OAUTH_DEEP_LINK_SCHEMES.android;
    return (
      allowed &&
      url.hostname === "auth" &&
      url.pathname.replace(/\/+$/, "") === "/callback"
    );
  } catch {
    return false;
  }
}

/**
 * Starts the Google OAuth redirect flow.
 *
 * `redirectPath` is an internal app path (e.g. `/store/x/checkout`) the user
 * should land on after authentication; the callback exchanges the Supabase
 * session, creates/links the app account and then forwards them there.
 *
 * Returns an error message when Supabase is not configured or the request
 * fails, `null` on success (the browser/webview is navigating away).
 */
export async function signInWithGoogle(
  redirectPath = "/"
): Promise<string | null> {
  const client = getSupabaseOAuthClient();
  if (!client) {
    return "oauth_not_configured";
  }

  const redirectTo = getOAuthRedirectUrl(redirectPath);
  if (!redirectTo) {
    return "oauth_not_configured";
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  return error ? error.message : null;
}

export interface OAuthCallbackResult {
  accessToken: string;
  /** Internal path to send the user to after the app session is created. */
  next: string;
}

function parseCallbackParams(
  search: string,
  hash: string
): { code: string | null; next: string } {
  const params = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    code: params.get("code") ?? hashParams.get("code"),
    next: sanitizeNextPath(params.get("next") ?? hashParams.get("next")),
  };
}

/**
 * Completes the OAuth round-trip.
 *
 * `rawUrl` is the callback URL — `window.location` on web, or the custom-scheme
 * deep link (`storehub://auth/callback?…`, `com.storehub.app://auth/callback?…`)
 * delivered to the native shells. Handles both PKCE (`?code=`) and implicit
 * (`#access_token=`) responses. Returns `null` when no Supabase session could
 * be established.
 */
export async function completeOAuthCallback(
  rawUrl?: string
): Promise<OAuthCallbackResult | null> {
  const client = getSupabaseOAuthClient();
  if (!client || typeof window === "undefined") return null;

  let search = window.location.search;
  let hash = window.location.hash;

  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      search = url.search;
      hash = url.hash;
    } catch {
      return null;
    }
  }

  const { code, next } = parseCallbackParams(search, hash);

  // PKCE flow: exchange the one-time code for a session. The code verifier
  // was stored by signInWithOAuth in this same webview's storage.
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.session?.access_token) {
      return { accessToken: data.session.access_token, next };
    }
    // Fall through — an implicit-flow hash may still be present.
  }

  // Implicit flow: tokens arrive in the URL fragment. For deep links the
  // fragment lives on `rawUrl`, not window.location, so hydrate the session
  // explicitly instead of relying on detectSessionInUrl.
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const hashAccessToken = hashParams.get("access_token");
  const hashRefreshToken = hashParams.get("refresh_token");
  if (hashAccessToken) {
    const { data, error } = await client.auth.setSession({
      access_token: hashAccessToken,
      refresh_token: hashRefreshToken ?? "",
    });
    if (!error && data.session?.access_token) {
      return { accessToken: data.session.access_token, next };
    }
  }

  // Web fallback: supabase-js parses `#access_token` into the session.
  const { data } = await client.auth.getSession();
  if (data.session?.access_token) {
    return { accessToken: data.session.access_token, next };
  }

  return null;
}

/**
 * Builds the custom-scheme URL that hands an in-flight OAuth callback back
 * to a native shell. Forwards the raw `code` (PKCE) and/or URL fragment
 * (implicit tokens) untouched — the app webview performs the exchange because
 * it owns the PKCE code verifier; session cookies cannot cross the
 * browser → webview boundary, so tokens must not be exchanged on the web.
 */
export function buildOAuthHandoffUrl(
  shell: OAuthShell,
  options: { code?: string | null; next?: string | null; hash?: string }
): string {
  const params = new URLSearchParams({
    next: sanitizeNextPath(options.next ?? null),
  });
  if (options.code) params.set("code", options.code);
  const hash = options.hash?.startsWith("#") ? options.hash : "";
  return `${SHELL_SCHEMES[shell]}://auth/callback?${params.toString()}${hash}`;
}

/**
 * Handles an OAuth callback delivered as a custom-scheme deep link inside a
 * native shell (Tauri / Capacitor). Returns the internal path to navigate
 * to, or `null` when the link isn't an OAuth callback or sign-in failed.
 */
export async function completeOAuthDeepLink(
  raw: string
): Promise<string | null> {
  if (!isOAuthDeepLink(raw)) return null;
  try {
    const result = await completeOAuthCallback(raw);
    if (!result) return null;
    return await exchangeOAuthForAppSession(result.accessToken, result.next);
  } catch (err) {
    console.error("[oauth] deep-link sign-in failed:", err);
    return null;
  }
}

/**
 * Exchanges a Supabase OAuth session for an app session via
 * `POST /api/auth/oauth` and returns the internal path to navigate to.
 * Throws with the server-provided message on failure.
 */
export async function exchangeOAuthForAppSession(
  accessToken: string,
  next: string
): Promise<string> {
  const res = await fetch("/api/auth/oauth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, next }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    redirectUrl?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || "Failed to complete sign-in");
  }

  const target = data.redirectUrl;
  if (
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//")
  ) {
    return target;
  }
  return "/dashboard";
}

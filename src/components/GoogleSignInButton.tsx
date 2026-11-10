"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signInWithGoogle } from "@/lib/oauth";
import { useI18n } from "@/lib/i18n";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  /**
   * Internal path to return to after auth (defaults to `/`). May be a
   * function so callers can resolve `?next=` at click time.
   */
  redirectTo?: string | (() => string);
  /** Extra classes merged onto the button. */
  className?: string;
  /** Called with an error key/message when sign-in cannot start. */
  onError?: (message: string) => void;
}

/**
 * "Continue with Google" button — kicks off the Supabase OAuth redirect and
 * returns the user to `redirectTo` once `/auth/callback` has bridged the
 * Google identity into an app session.
 */
export default function GoogleSignInButton({
  redirectTo = "/",
  className = "",
  onError,
}: GoogleSignInButtonProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    const resolved =
      typeof redirectTo === "function" ? redirectTo() : redirectTo || "/";
    try {
      const error = await signInWithGoogle(resolved);
      if (error) {
        onError?.(error === "oauth_not_configured" ? t("auth.oauthNotConfigured") : error);
        setLoading(false);
      }
      // On success the browser is redirected to Google — keep the spinner.
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("auth.somethingWrong"));
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
      ) : (
        <GoogleIcon />
      )}
      {loading ? t("auth.redirectingToGoogle") : t("auth.continueWithGoogle")}
    </button>
  );
}

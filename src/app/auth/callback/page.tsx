"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, MonitorSmartphone } from "lucide-react";
import {
  buildOAuthHandoffUrl,
  completeOAuthCallback,
  exchangeOAuthForAppSession,
  type OAuthShell,
} from "@/lib/oauth";
import { isCapacitorNativeApp, isTauriDesktopApp } from "@/lib/platform";
import { useI18n } from "@/lib/i18n";

function isOAuthShell(value: string | null): value is OAuthShell {
  return value === "tauri" || value === "android";
}

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const providerError = searchParams.get("error");
      if (providerError) {
        const description = searchParams.get("error_description") ?? "";
        setError(description || providerError);
        return;
      }

      // `?shell=` (and the `?app=` alias) marks a native-shell OAuth flow that
      // was bounced through the web callback because the custom scheme could
      // not be allow-listed. Forward the raw `code`/fragment to the app
      // scheme untouched — the app webview owns the PKCE verifier and
      // exchanges it there, since the app `session` cookie cannot cross the
      // browser → webview boundary.
      const shellParam = searchParams.get("shell") ?? searchParams.get("app");
      const shell = isOAuthShell(shellParam) ? shellParam : null;
      const insideShell = isTauriDesktopApp() || isCapacitorNativeApp();
      if (shell && !insideShell) {
        const target = buildOAuthHandoffUrl(shell, {
          code: searchParams.get("code"),
          next: searchParams.get("next"),
          hash: window.location.hash,
        });
        if (cancelled) return;
        setHandoffUrl(target);
        // Protocol launch — browsers show an "Open app?" prompt. The rendered
        // fallback link covers browsers that block the automatic redirect.
        window.location.href = target;
        return;
      }

      try {
        const result = await completeOAuthCallback();
        if (cancelled) return;

        if (!result) {
          setError(t("auth.oauthSessionMissing"));
          return;
        }

        // Full navigation so the freshly set `session` cookie is picked up.
        window.location.replace(
          await exchangeOAuthForAppSession(result.accessToken, result.next)
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("auth.somethingWrong"));
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (handoffUrl) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
          <MonitorSmartphone className="h-7 w-7 text-indigo-600" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          {t("auth.openDesktopApp")}
        </h1>
        <p className="mb-6 text-sm text-slate-600">{t("auth.openDesktopAppHint")}</p>
        <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-indigo-600" />
        <a
          href={handoffUrl}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {t("auth.openDesktopApp")}
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          {t("auth.oauthFailedTitle")}
        </h1>
        <p className="mb-6 text-sm text-slate-600">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t("auth.signInLink")}
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("auth.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      <p className="text-sm text-slate-600">{t("auth.completingSignIn")}</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Suspense
        fallback={
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}

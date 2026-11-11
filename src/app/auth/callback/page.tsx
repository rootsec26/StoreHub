"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import {
  completeOAuthCallback,
  exchangeOAuthForAppSession,
} from "@/lib/oauth";
import { useI18n } from "@/lib/i18n";

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const providerError = searchParams.get("error");
      if (providerError) {
        const description = searchParams.get("error_description") ?? "";
        setError(description || providerError);
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

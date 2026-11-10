"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import GoogleSignInButton from "@/components/GoogleSignInButton";

function safeNextPath(): string {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function SignupPage() {
  const { t } = useI18n();
  const [oauthError, setOauthError] = useState("");

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        {t("auth.signupTitle")}
      </h1>
      <p className="mb-8 text-slate-600">{t("auth.signupSubtitle")}</p>

      {oauthError && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {oauthError}
        </div>
      )}

      <GoogleSignInButton redirectTo={safeNextPath} onError={setOauthError} />

      <p className="mt-6 text-center text-sm text-slate-600">
        {t("auth.hasAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          {t("auth.signInLink")}
        </Link>
      </p>
    </>
  );
}

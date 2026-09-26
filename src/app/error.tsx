"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-16 w-16 text-amber-400" />
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">
        500
      </p>
      <h1 className="text-2xl font-bold text-slate-900">{t("error.title")}</h1>
      <p className="max-w-md text-slate-600">{t("error.subtitle")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <RotateCcw className="h-4 w-4" />
          {t("error.retry")}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("store.goHome")}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-slate-400">
          ref: {error.digest}
        </p>
      )}
    </div>
  );
}

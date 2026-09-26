"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Package } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { storePath } from "@/lib/site";

export default function ProductNotFound() {
  const { t } = useI18n();
  const params = useParams<{ slug?: string }>();
  const slug = params?.slug;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Package className="h-16 w-16 text-slate-300" />
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
        404
      </p>
      <h1 className="text-2xl font-bold text-slate-900">
        {t("product.notFoundTitle")}
      </h1>
      <p className="max-w-md text-slate-600">{t("product.notFoundSubtitle")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {slug && (
          <Link
            href={storePath(slug)}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("product.backToStore")}
          </Link>
        )}
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t("store.goHome")}
        </Link>
      </div>
    </div>
  );
}

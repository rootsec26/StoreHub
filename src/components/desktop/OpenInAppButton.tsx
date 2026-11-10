"use client";

import { useState } from "react";
import { MonitorSmartphone, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { isNativeAppShell } from "@/lib/platform";

const DISMISS_KEY = "storehub-open-in-app-dismissed";

/**
 * "Open in Desktop App" pill shown on storefront pages in a regular browser.
 * Fires the storehub:// custom protocol — if the StoreHub desktop app is
 * installed the OS hands the URL to it; otherwise the browser simply ignores
 * the navigation. Dismissible per browser session.
 */
export default function OpenInAppButton() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(DISMISS_KEY) === "1"
  );

  if (dismissed || isNativeAppShell()) return null;

  function openInApp() {
    const target = `storehub://open?url=${encodeURIComponent(window.location.href)}`;
    window.location.href = target;
  }

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-indigo-200/60 bg-white/90 py-1.5 ps-4 pe-1.5 shadow-lg shadow-indigo-100 backdrop-blur-md">
      <button
        onClick={openInApp}
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 transition hover:text-indigo-900"
      >
        <MonitorSmartphone className="h-4 w-4" />
        {t("store.openInApp")}
      </button>
      <button
        onClick={dismiss}
        aria-label={t("common.close")}
        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

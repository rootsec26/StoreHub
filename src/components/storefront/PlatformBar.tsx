"use client";

import Link from "next/link";
import { Home, MessageCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const SUPPORT_WHATSAPP_URL = "https://wa.me/201065592701";
const SUPPORT_PHONE_DISPLAY = "01065592701";

/**
 * Slim platform bar pinned to the top of every storefront page.
 * Gives shoppers a one-tap route back to the StoreHub landing page
 * (top stores + platform feed) and a direct WhatsApp support channel.
 */
export default function PlatformBar() {
  const { t } = useI18n();

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <Home className="h-3.5 w-3.5" />
          {t("store.platformHome")}
        </Link>

        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t("store.platformSupport")}
          aria-label={`${t("store.platformSupport")}: ${SUPPORT_PHONE_DISPLAY}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100"
          dir="ltr"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {SUPPORT_PHONE_DISPLAY}
        </a>
      </div>
    </div>
  );
}

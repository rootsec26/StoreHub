"use client";

import { Send } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const TELEGRAM_URL = "https://t.me/rootsec26";

/**
 * Slim platform bar pinned to the top of every storefront page.
 * Directs shoppers with an issue to the official Telegram support channel.
 */
export default function PlatformBar() {
  const { t } = useI18n();

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-1.5 sm:justify-end sm:px-6">
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t("store.platformTelegram")}
          aria-label={t("store.platformTelegram")}
          className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200 transition-colors hover:bg-sky-100"
        >
          <span>{t("store.platformTelegram")}</span>
          <Send className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

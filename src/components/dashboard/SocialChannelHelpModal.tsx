"use client";

import { useEffect } from "react";
import { ExternalLink, Lock, X } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";

type HelpPlatform = "FACEBOOK" | "INSTAGRAM" | "WHATSAPP";

interface SocialChannelHelpModalProps {
  /** `null` keeps the modal closed. */
  platform: HelpPlatform | null;
  /** The store webhook shown in the instructions, when available. */
  webhookUrl?: string;
  onClose: () => void;
}

const STEPS: Record<HelpPlatform, TranslationKey[]> = {
  FACEBOOK: [
    "socialBot.help.step.FACEBOOK.1",
    "socialBot.help.step.FACEBOOK.2",
    "socialBot.help.step.FACEBOOK.3",
    "socialBot.help.step.FACEBOOK.4",
  ],
  INSTAGRAM: [
    "socialBot.help.step.INSTAGRAM.1",
    "socialBot.help.step.INSTAGRAM.2",
    "socialBot.help.step.INSTAGRAM.3",
    "socialBot.help.step.INSTAGRAM.4",
  ],
  WHATSAPP: [
    "socialBot.help.step.WHATSAPP.1",
    "socialBot.help.step.WHATSAPP.2",
    "socialBot.help.step.WHATSAPP.3",
    "socialBot.help.step.WHATSAPP.4",
  ],
};

const LINKS: Record<HelpPlatform, { labelKey: TranslationKey; href: string }[]> = {
  FACEBOOK: [
    { labelKey: "socialBot.help.linkMetaDevelopers", href: "https://developers.facebook.com/apps/" },
    { labelKey: "socialBot.help.linkGraphExplorer", href: "https://developers.facebook.com/tools/explorer/" },
    { labelKey: "socialBot.help.linkBusinessSettings", href: "https://business.facebook.com/settings/" },
  ],
  INSTAGRAM: [
    { labelKey: "socialBot.help.linkMetaDevelopers", href: "https://developers.facebook.com/apps/" },
    { labelKey: "socialBot.help.linkInstagramDocs", href: "https://developers.facebook.com/docs/instagram-api/" },
    { labelKey: "socialBot.help.linkGraphExplorer", href: "https://developers.facebook.com/tools/explorer/" },
  ],
  WHATSAPP: [
    { labelKey: "socialBot.help.linkWhatsappCloud", href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" },
    { labelKey: "socialBot.help.linkMetaDevelopers", href: "https://developers.facebook.com/apps/" },
    { labelKey: "socialBot.help.linkBusinessSettings", href: "https://business.facebook.com/settings/" },
  ],
};

/**
 * Arabic/English step-by-step drawer explaining where a merchant copies the
 * Page ID + Access Token from (Meta for Developers / WhatsApp Cloud API) and
 * how those secrets are stored.
 */
export default function SocialChannelHelpModal({
  platform,
  webhookUrl,
  onClose,
}: SocialChannelHelpModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!platform) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platform, onClose]);

  if (!platform) return null;

  const steps = STEPS[platform];
  const links = LINKS[platform];
  const title = t("socialBot.help.title", {
    platform: t(`socialBot.platform.${platform}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("socialBot.help.intro")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="shrink-0 text-slate-400 transition-colors hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {steps.map((stepKey, index) => (
            <li key={stepKey} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
                {index + 1}
              </span>
              <p className="text-sm leading-relaxed text-slate-600">{t(stepKey)}</p>
            </li>
          ))}
        </ol>

        {webhookUrl && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-slate-600">
              {t("socialBot.help.webhook")}
            </p>
            <code dir="ltr" className="mt-1.5 block truncate text-xs text-indigo-700">
              {webhookUrl}
            </code>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("socialBot.help.links")}
          </p>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t(link.labelKey)}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs leading-relaxed text-emerald-800">
            {t("socialBot.help.encryption")}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          {t("socialBot.help.close")}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ExternalLink, Rocket } from "lucide-react";

import { useI18n, type TranslationKey } from "@/lib/i18n";

const META_DEVELOPERS_URL = "https://developers.facebook.com/apps/";

interface SocialBotSetupBannerProps {
  /** Number of channels with a saved Page ID + Access Token. */
  connectedCount: number;
  /** Number of connected channels with the auto-reply switch on. */
  autoReplyCount: number;
  /** Opens the connect form of the first channel that is still pending. */
  onStart: () => void;
  /** Scrolls to the channel cards so the merchant can flip the auto-reply. */
  onShowAutoReply: () => void;
}

/**
 * Collapsible 3-step onboarding stepper shown at the top of the AI Sales
 * Representative page so merchants can connect Meta/WhatsApp unaided.
 */
export default function SocialBotSetupBanner({
  connectedCount,
  autoReplyCount,
  onStart,
  onShowAutoReply,
}: SocialBotSetupBannerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);

  const steps: { titleKey: TranslationKey; descKey: TranslationKey; done: boolean; action: ReactNode }[] =
    [
      {
        titleKey: "socialBot.setup.step1.title",
        descKey: "socialBot.setup.step1.desc",
        done: connectedCount > 0,
        action: (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {t("socialBot.setup.step1.action")}
          </button>
        ),
      },
      {
        titleKey: "socialBot.setup.step2.title",
        descKey: "socialBot.setup.step2.desc",
        done: connectedCount > 0,
        action: (
          <a
            href={META_DEVELOPERS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("socialBot.setup.step2.action")}
          </a>
        ),
      },
      {
        titleKey: "socialBot.setup.step3.title",
        descKey: "socialBot.setup.step3.desc",
        done: autoReplyCount > 0,
        action: (
          <button
            type="button"
            onClick={onShowAutoReply}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t("socialBot.setup.step3.action")}
          </button>
        ),
      },
    ];

  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  return (
    <section
      aria-label={t("socialBot.setup.title")}
      className="overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="social-setup-steps"
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Rocket className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold leading-snug text-slate-900">
              {t("socialBot.setup.title")}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {t("socialBot.setup.subtitle")}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-block ${
              allDone ? "bg-emerald-100 text-emerald-700" : "bg-white text-indigo-700 shadow-sm"
            }`}
          >
            {t("socialBot.setup.progress", { done: doneCount, total: steps.length })}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
        <span className="sr-only">
          {open ? t("socialBot.setup.collapse") : t("socialBot.setup.expand")}
        </span>
      </button>

      {open && (
        <div id="social-setup-steps" className="border-t border-indigo-100 px-4 pb-4 pt-4 sm:px-5">
          <ol className="grid gap-3 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.titleKey}
                className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.done ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white"
                    }`}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{t(step.titleKey)}</p>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-500">
                  {t(step.descKey)}
                </p>
                <div className="mt-3">{step.action}</div>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[11px] text-slate-400">
            {t("socialBot.setup.progress", { done: doneCount, total: steps.length })}
            {allDone ? ` — ${t("socialBot.setup.stepDone")}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

"use client";

import { CheckCircle2, ClipboardCheck, Package, Truck, XCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  TRACKING_STEP_KEYS,
  getTrackingStepIndex,
  type TrackingStepKey,
} from "@/lib/order-tracking";

const STEP_ICONS: Record<TrackingStepKey, React.ReactNode> = {
  received: <ClipboardCheck className="h-5 w-5" />,
  processing: <Package className="h-5 w-5" />,
  shipped: <Truck className="h-5 w-5" />,
  delivered: <CheckCircle2 className="h-5 w-5" />,
};

type StepState = "done" | "current" | "upcoming";

interface OrderStatusTimelineProps {
  status: string;
}

export default function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  const { t } = useI18n();

  const cancelled = status === "Cancelled";
  const currentIndex = cancelled ? -1 : getTrackingStepIndex(status);
  const currentStepKey: TrackingStepKey =
    TRACKING_STEP_KEYS[Math.min(Math.max(currentIndex, 0), 3)];

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">
          {t("orders.timeline.title")}
        </h3>
        {cancelled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            <XCircle className="h-4 w-4" />
            {t("orders.timeline.cancelled")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-sm font-medium text-[var(--color-primary)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" />
            </span>
            {t(`orders.timeline.${currentStepKey}`)}
          </span>
        )}
      </div>

      {cancelled && (
        <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("orders.timeline.cancelledDesc")}</span>
        </div>
      )}

      <ol className="flex flex-col sm:flex-row">
        {TRACKING_STEP_KEYS.map((key, index) => {
          const stepState: StepState = cancelled
            ? "upcoming"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";

          const isLast = index === TRACKING_STEP_KEYS.length - 1;

          const circleClass =
            stepState === "done"
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
              : stepState === "current"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                : "border-slate-200 bg-white text-slate-400";

          const lineClass =
            !isLast && stepState === "done" ? "bg-[var(--color-primary)]" : "bg-slate-200";

          const titleClass =
            stepState === "current"
              ? "font-semibold text-[var(--color-primary)]"
              : stepState === "done"
                ? "font-medium text-slate-900"
                : "font-medium text-slate-400";

          return (
            <li
              key={key}
              className="relative flex flex-1 gap-3 pb-8 last:pb-0 sm:flex-col sm:items-center sm:gap-2.5 sm:pb-0"
            >
              {!isLast && (
                <>
                  <span
                    aria-hidden
                    className={`absolute bottom-1 start-[19px] top-10 w-0.5 sm:hidden ${lineClass}`}
                  />
                  <span
                    aria-hidden
                    className={`absolute hidden h-0.5 start-[calc(50%+1.5rem)] top-[19px] w-[calc(100%-3rem)] sm:block ${lineClass}`}
                  />
                </>
              )}

              <span
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${circleClass}`}
              >
                {stepState === "current" && (
                  <span
                    aria-hidden
                    className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-30"
                  />
                )}
                <span className="relative">{STEP_ICONS[key]}</span>
              </span>

              <div className="min-w-0 flex-1 sm:w-full sm:flex-none sm:px-1 sm:text-center">
                <p className={`text-sm ${titleClass}`}>
                  {t(`orders.timeline.${key}`)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 sm:mt-1">
                  {t(`orders.timeline.${key}Desc`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

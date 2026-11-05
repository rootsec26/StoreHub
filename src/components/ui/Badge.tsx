import type { ReactNode } from "react";

import { cn } from "./cn";

export type BadgeTone =
  | "slate"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "violet";

const TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export default function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "SENT":
    case "DELIVERED":
    case "READ":
      return "emerald";
    case "PARTIAL":
    case "SCHEDULED":
    case "QUEUED":
      return "amber";
    case "FAILED":
    case "CANCELLED":
      return "rose";
    case "DRAFT":
    case "PENDING":
      return "slate";
    case "SENDING":
      return "sky";
    case "SKIPPED":
      return "violet";
    default:
      return "slate";
  }
}

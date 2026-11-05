"use client";

import { X } from "lucide-react";

import { cn } from "./cn";

export type ToastTone = "info" | "success" | "error";

const TONES: Record<ToastTone, string> = {
  info: "bg-slate-900 text-white",
  success: "bg-emerald-600 text-white",
  error: "bg-rose-600 text-white",
};

export default function Toast({
  message,
  tone = "info",
  onClose,
}: {
  message: string | null;
  tone?: ToastTone;
  onClose?: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 end-4 z-[90] flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
        TONES[tone]
      )}
    >
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

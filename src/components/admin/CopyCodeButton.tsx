"use client";

interface CopyCodeButtonProps {
  value: string;
}

export default function CopyCodeButton({ value }: CopyCodeButtonProps) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value)}
      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
    >
      Copy
    </button>
  );
}

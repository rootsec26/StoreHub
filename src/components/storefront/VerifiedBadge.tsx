import { BadgeCheck } from "lucide-react";

/**
 * Premium verified badge shown next to store names across the storefront.
 * Vibrant cyan-blue fill with a neon glow so it reads as an official
 * enterprise verification mark on both dark and light surfaces.
 */
export default function VerifiedBadge({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <BadgeCheck
      className={`shrink-0 fill-sky-400 text-sky-200 drop-shadow-[0_0_6px_rgba(56,189,248,0.7)] drop-shadow-[0_0_14px_rgba(14,165,233,0.4)] ${className}`}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

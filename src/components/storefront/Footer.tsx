"use client";

import type { ReactNode } from "react";
import { Store } from "lucide-react";

import { useI18n } from "@/lib/i18n";

interface StoreFooterProps {
  /**
   * White-label add-on is active -> the "Powered by StoreHub" credit is
   * hidden (the footer disappears entirely unless extra content is given).
   */
  hasWhiteLabel?: boolean;
  /** Leading icon next to the credit; defaults to the Store glyph. */
  icon?: ReactNode;
  /** Inner container classes (max width / padding / alignment). */
  containerClassName?: string;
  /** Extra footer content (e.g. a "back to store" link) always rendered. */
  children?: ReactNode;
}

/**
 * Shared storefront footer carrying the platform credit. Stores on the
 * white-label add-on never render the credit.
 */
export default function StoreFooter({
  hasWhiteLabel = false,
  icon,
  containerClassName = "mx-auto max-w-7xl px-4 text-center sm:px-6",
  children,
}: StoreFooterProps) {
  const { t } = useI18n();

  if (hasWhiteLabel && !children) return null;

  return (
    <footer className="border-t bg-white py-6">
      <div className={containerClassName}>
        {!hasWhiteLabel && (
          <div className="flex items-center justify-center gap-2">
            {icon ?? <Store className="h-4 w-4 text-[var(--color-primary)]" />}
            <span className="text-sm font-medium text-slate-600">
              {t("store.poweredBy")}
            </span>
          </div>
        )}
        {children}
      </div>
    </footer>
  );
}

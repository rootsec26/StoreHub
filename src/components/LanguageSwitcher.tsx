"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";

import { useI18n, type Locale } from "@/lib/i18n";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "ar", label: "AR · العربية" },
  { value: "en", label: "EN · English" },
];

/**
 * Topbar language dropdown. Shows the active locale (Arabic by default) and
 * switches the document between RTL/LTR, persisting the choice to
 * localStorage + cookie via the shared I18n context.
 */
export default function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const current =
    LOCALE_OPTIONS.find((option) => option.value === locale) ??
    LOCALE_OPTIONS[0];

  function selectLocale(next: Locale) {
    setLocale(next);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        title={t("common.language")}
        aria-label={t("common.language")}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Languages className="h-4 w-4" />
        <span>{current.label}</span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute end-0 z-50 mt-1.5 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <ul role="listbox" aria-label={t("common.language")}>
              {LOCALE_OPTIONS.map((option) => {
                const isSelected = option.value === locale;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => selectLocale(option.value)}
                      role="option"
                      aria-selected={isSelected}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? "bg-indigo-50 font-medium text-indigo-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex-1 text-start">{option.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

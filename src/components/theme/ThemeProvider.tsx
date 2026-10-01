"use client";

import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_THEME_CONFIG, type ThemeConfig, type FontFamily } from "@/lib/theme-config";

const FONT_URLS: Record<FontFamily, string> = {
  Inter: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
  Cairo: "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&display=swap",
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap",
  Roboto: "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap",
};

const BORDER_RADIUS_VALUES: Record<ThemeConfig["borderRadius"], string> = {
  none: "0",
  sm: "4px",
  md: "8px",
  lg: "12px",
  full: "9999px",
};

function buildCSSVariables(config: ThemeConfig): CSSProperties {
  const radius = BORDER_RADIUS_VALUES[config.borderRadius];
  const fontFamily = config.fontFamily;

  return {
    "--color-primary": config.primaryColor,
    "--color-primary-dark": darkenHex(config.primaryColor, 0.2),
    "--color-primary-soft": `${config.primaryColor}1a`,
    "--color-secondary": config.secondaryColor,
    "--color-secondary-dark": darkenHex(config.secondaryColor, 0.2),
    "--color-background": config.backgroundColor,
    "--color-text": config.textColor,
    "--color-text-muted": `${config.textColor}99`,
    "--font-main": fontFamily,
    "--radius": radius,
    "--radius-sm": `calc(${radius} / 2)`,
    "--radius-lg": `calc(${radius} * 1.5)`,
    "--hero-style": config.heroStyle,
  } as CSSProperties;
}

function darkenHex(hex: string, amount: number): string {
  const short = hex.length === 4;
  const value = short
    ? hex.slice(1).split("").map((c) => c + c).join("")
    : hex.slice(1);

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  const factor = Math.max(0, Math.min(1, 1 - amount));
  const toHex = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * factor)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function loadGoogleFont(fontFamily: FontFamily): void {
  if (typeof document === "undefined") return;

  const existingLink = document.querySelector(`link[data-font="${fontFamily}"]`);
  if (existingLink) return;

  const url = FONT_URLS[fontFamily];
  if (!url) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.font = fontFamily;
  document.head.appendChild(link);
}

interface ThemeProviderProps {
  config: ThemeConfig;
  children: React.ReactNode;
}

export function ThemeProvider({ config, children }: ThemeProviderProps) {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_THEME_CONFIG, ...config }),
    [config]
  );

  const cssVariables = useMemo(
    () => buildCSSVariables(mergedConfig),
    [mergedConfig]
  );

  useEffect(() => {
    loadGoogleFont(mergedConfig.fontFamily);
  }, [mergedConfig.fontFamily]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(cssVariables).forEach(([key, value]) => {
      root.style.setProperty(key, value as string);
    });

    return () => {
      Object.keys(cssVariables).forEach((key) => {
        root.style.removeProperty(key);
      });
    };
  }, [cssVariables]);

  return (
    <div style={cssVariables} className="theme-root">
      {children}
    </div>
  );
}

export function useThemeConfig(config: Partial<ThemeConfig> = {}): ThemeConfig {
  return useMemo(
    () => ({ ...DEFAULT_THEME_CONFIG, ...config }),
    [config]
  );
}
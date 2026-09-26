import type { CSSProperties } from "react";

export const DEFAULT_ACCENT = "#4f46e5";

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function expandHex(hex: string): [number, number, number] {
  const short = hex.length === 4;
  const value = short
    ? hex
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    : hex.slice(1);

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Darkens a hex color by `amount` (0 = unchanged, 1 = black). */
export function darkenHex(hex: string, amount: number): string {
  if (!isHexColor(hex)) return DEFAULT_ACCENT;
  const [r, g, b] = expandHex(hex);
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const toHex = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Resolves a stored accent value into a safe hex color. */
export function normalizeAccent(value: unknown): string {
  return isHexColor(value) ? value : DEFAULT_ACCENT;
}

/** Two-stop gradient built from the brand accent. */
export function accentGradient(accent: string): string {
  const base = normalizeAccent(accent);
  return `linear-gradient(135deg, ${base} 0%, ${darkenHex(base, 0.35)} 100%)`;
}

/** CSS custom properties applied to the storefront root element. */
export function accentThemeStyle(accent: string): CSSProperties {
  const base = normalizeAccent(accent);
  return {
    "--store-accent": base,
    "--store-accent-dark": darkenHex(base, 0.2),
    "--store-accent-soft": `${base}1a`,
  } as CSSProperties;
}

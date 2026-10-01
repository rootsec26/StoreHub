export type ThemeId = 'modern' | 'minimal' | 'luxury';
export type FontFamily = 'Inter' | 'Cairo' | 'Playfair Display' | 'Roboto';
export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
export type HeroStyle = 'banner' | 'centered' | 'split';

export interface ThemeConfig {
  themeId: ThemeId;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: FontFamily;
  borderRadius: BorderRadius;
  heroStyle: HeroStyle;
  showAnnouncementBar: boolean;
  announcementText?: string;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  themeId: 'modern',
  primaryColor: '#4f46e5',
  secondaryColor: '#06b6d4',
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  fontFamily: 'Cairo',
  borderRadius: 'md',
  heroStyle: 'banner',
  showAnnouncementBar: false,
};

export const FONT_FAMILIES: { value: FontFamily; label: string; cssName: string }[] = [
  { value: 'Inter', label: 'Inter', cssName: '"Inter", sans-serif' },
  { value: 'Cairo', label: 'Cairo (Arabic/English)', cssName: '"Cairo", sans-serif' },
  { value: 'Playfair Display', label: 'Playfair Display (Serif)', cssName: '"Playfair Display", serif' },
  { value: 'Roboto', label: 'Roboto', cssName: '"Roboto", sans-serif' },
];

export const BORDER_RADIUS_OPTIONS: { value: BorderRadius; label: string }[] = [
  { value: 'none', label: 'None (0px)' },
  { value: 'sm', label: 'Small (4px)' },
  { value: 'md', label: 'Medium (8px)' },
  { value: 'lg', label: 'Large (12px)' },
  { value: 'full', label: 'Full (9999px)' },
];

export const HERO_STYLES: { value: HeroStyle; label: string; description: string }[] = [
  { value: 'banner', label: 'Banner', description: 'Full-width hero with background image' },
  { value: 'centered', label: 'Centered', description: 'Centered content with logo and tagline' },
  { value: 'split', label: 'Split', description: 'Split layout with image and content side by side' },
];

export const THEME_PRESETS: Record<ThemeId, Omit<ThemeConfig, 'showAnnouncementBar' | 'announcementText'>> = {
  modern: {
    themeId: 'modern',
    primaryColor: '#4f46e5',
    secondaryColor: '#06b6d4',
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
    fontFamily: 'Cairo',
    borderRadius: 'md',
    heroStyle: 'banner',
  },
  minimal: {
    themeId: 'minimal',
    primaryColor: '#0f172a',
    secondaryColor: '#64748b',
    backgroundColor: '#fafafa',
    textColor: '#1e293b',
    fontFamily: 'Inter',
    borderRadius: 'none',
    heroStyle: 'centered',
  },
  luxury: {
    themeId: 'luxury',
    primaryColor: '#1c1917',
    secondaryColor: '#d4a843',
    backgroundColor: '#0f0f0f',
    textColor: '#fafafa',
    fontFamily: 'Playfair Display',
    borderRadius: 'sm',
    heroStyle: 'split',
  },
};

export const COLOR_PRESETS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#0f172a',
  '#1c1917', '#d4a843', '#06b6d4', '#14b8a6',
  '#84cc16', '#f97316', '#e11d48', '#a855f7',
];

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_PATTERN.test(value);
}

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'modern' || value === 'minimal' || value === 'luxury';
}

export function isFontFamily(value: unknown): value is FontFamily {
  return value === 'Inter' || value === 'Cairo' || value === 'Playfair Display' || value === 'Roboto';
}

export function isBorderRadius(value: unknown): value is BorderRadius {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg' || value === 'full';
}

export function isHeroStyle(value: unknown): value is HeroStyle {
  return value === 'banner' || value === 'centered' || value === 'split';
}

/**
 * Normalizes a raw (possibly partial/invalid) theme config from the DB or API
 * into a fully valid `ThemeConfig`. Safe to call on the server and client —
 * always returns the same output for the same input, so hydration matches.
 */
export function resolveThemeConfig(raw: unknown): ThemeConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThemeConfig>;
  const fallback = DEFAULT_THEME_CONFIG;

  return {
    themeId: isThemeId(input.themeId) ? input.themeId : fallback.themeId,
    primaryColor: isHexColor(input.primaryColor) ? input.primaryColor : fallback.primaryColor,
    secondaryColor: isHexColor(input.secondaryColor) ? input.secondaryColor : fallback.secondaryColor,
    backgroundColor: isHexColor(input.backgroundColor) ? input.backgroundColor : fallback.backgroundColor,
    textColor: isHexColor(input.textColor) ? input.textColor : fallback.textColor,
    fontFamily: isFontFamily(input.fontFamily) ? input.fontFamily : fallback.fontFamily,
    borderRadius: isBorderRadius(input.borderRadius) ? input.borderRadius : fallback.borderRadius,
    heroStyle: isHeroStyle(input.heroStyle) ? input.heroStyle : fallback.heroStyle,
    showAnnouncementBar: typeof input.showAnnouncementBar === 'boolean' ? input.showAnnouncementBar : fallback.showAnnouncementBar,
    ...(typeof input.announcementText === 'string' ? { announcementText: input.announcementText } : {}),
  };
}

export const THEME_CONFIG_KEYS = [
  'themeId',
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'textColor',
  'fontFamily',
  'borderRadius',
  'heroStyle',
  'showAnnouncementBar',
  'announcementText',
] as const;

/**
 * Validates a raw theme payload coming from the API and returns a fully
 * normalized `ThemeConfig`. Returns `null` when the payload is not an object
 * or when any provided value is invalid, so callers can answer with a 400
 * instead of silently storing broken data.
 */
export function parseThemeConfig(raw: unknown): ThemeConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  if (input.themeId !== undefined && !isThemeId(input.themeId)) return null;
  if (input.fontFamily !== undefined && !isFontFamily(input.fontFamily)) return null;
  if (input.borderRadius !== undefined && !isBorderRadius(input.borderRadius)) return null;
  if (input.heroStyle !== undefined && !isHeroStyle(input.heroStyle)) return null;
  if (input.showAnnouncementBar !== undefined && typeof input.showAnnouncementBar !== 'boolean') {
    return null;
  }
  if (input.announcementText !== undefined && typeof input.announcementText !== 'string') {
    return null;
  }
  for (const key of ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor'] as const) {
    if (input[key] !== undefined && !isHexColor(input[key])) return null;
  }

  return resolveThemeConfig(input);
}

/**
 * Builds a complete config from a theme preset. Announcement-bar settings
 * are preserved when switching templates so merchants don't lose them.
 */
export function applyThemePreset(
  themeId: ThemeId,
  current: Partial<ThemeConfig> = {}
): ThemeConfig {
  return resolveThemeConfig({
    ...THEME_PRESETS[themeId],
    themeId,
    showAnnouncementBar: current.showAnnouncementBar ?? DEFAULT_THEME_CONFIG.showAnnouncementBar,
    announcementText: current.announcementText,
  });
}
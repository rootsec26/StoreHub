import { ThemeProvider } from "../ThemeProvider";
import type { ThemeConfig } from "@/lib/theme-config";

interface ThemeTemplateProps {
  config: ThemeConfig;
  children: React.ReactNode;
}

export function ModernTheme({ config, children }: ThemeTemplateProps) {
  return (
    <ThemeProvider config={config}>
      <div className="modern-theme">
        {children}
      </div>
    </ThemeProvider>
  );
}

export function MinimalTheme({ config, children }: ThemeTemplateProps) {
  return (
    <ThemeProvider config={config}>
      <div className="minimal-theme">
        {children}
      </div>
    </ThemeProvider>
  );
}

export function LuxuryTheme({ config, children }: ThemeTemplateProps) {
  return (
    <ThemeProvider config={config}>
      <div className="luxury-theme">
        {children}
      </div>
    </ThemeProvider>
  );
}

export function getThemeTemplate(themeId: ThemeConfig["themeId"]) {
  switch (themeId) {
    case "modern":
      return ModernTheme;
    case "minimal":
      return MinimalTheme;
    case "luxury":
      return LuxuryTheme;
    default:
      return ModernTheme;
  }
}
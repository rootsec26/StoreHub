import { NextResponse } from "next/server";
import { stores } from "@/db/schema";
import { isHexColor } from "@/lib/theme";
import {
  THEME_CONFIG_KEYS,
  parseThemeConfig,
  resolveThemeConfig,
  type ThemeConfig,
} from "@/lib/theme-config";

export type StoreRow = typeof stores.$inferSelect;

export type BuildStoreUpdateResult =
  | { update: Partial<StoreRow>; error?: undefined }
  | { update?: undefined; error: NextResponse };

const TEXT_FIELDS = [
  "description",
  "category",
  "phone",
  "address",
  "logoUrl",
  "coverUrl",
  "stripeAccountId",
  "paddleVendorId",
  "manualPaymentInstructions",
] as const;

const BOOLEAN_FIELDS = ["stripeEnabled", "paddleEnabled"] as const;

function badRequest(error: string, code: string): NextResponse {
  return NextResponse.json({ error, code }, { status: 400 });
}

/**
 * Reads a JSON object body, answering with a 400 instead of letting a
 * malformed payload bubble up as a 500 internal server error.
 */
export async function readJsonObject(
  request: Request
): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be a JSON object", "INVALID_BODY");
    }
    return body as Record<string, unknown>;
  } catch {
    return badRequest("Request body is not valid JSON", "INVALID_JSON");
  }
}

/**
 * Resolves the theme part of a store update payload. Accepts either a full
 * `themeConfig` object or the legacy flat theme fields sent one by one.
 */
function buildThemeUpdate(
  body: Record<string, unknown>,
  current: StoreRow["themeConfig"]
): { themeConfig: ThemeConfig } | NextResponse | null {
  if (body.themeConfig !== undefined) {
    const parsed = parseThemeConfig(body.themeConfig);
    if (!parsed) return badRequest("Invalid theme configuration", "INVALID_THEME_CONFIG");
    return { themeConfig: parsed };
  }

  const flat: Record<string, unknown> = {};
  for (const key of THEME_CONFIG_KEYS) {
    if (body[key] !== undefined) flat[key] = body[key];
  }
  if (Object.keys(flat).length === 0) return null;

  const parsed = parseThemeConfig({ ...resolveThemeConfig(current), ...flat });
  if (!parsed) return badRequest("Invalid theme configuration", "INVALID_THEME_CONFIG");
  return { themeConfig: parsed };
}

/**
 * Maps an incoming store update payload onto a Drizzle `set()` object,
 * validating every field and returning a ready-made error response when the
 * payload is invalid or contains nothing updateable.
 */
export function buildStoreUpdate(
  body: Record<string, unknown>,
  store: StoreRow
): BuildStoreUpdateResult {
  const update: Partial<StoreRow> = {};

  if (typeof body.name === "string" && body.name) {
    update.name = body.name;
  }

  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (typeof value === "string") {
      update[field] = value;
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = body[field];
    if (typeof value === "boolean") {
      update[field] = value;
    }
  }

  if (body.accentColor !== undefined) {
    if (typeof body.accentColor !== "string") {
      return { error: badRequest("accentColor must be a hex color like #4f46e5", "INVALID_COLOR") };
    }
    if (body.accentColor !== "" && !isHexColor(body.accentColor)) {
      return { error: badRequest("accentColor must be a hex color like #4f46e5", "INVALID_COLOR") };
    }
    update.accentColor = body.accentColor;
  }

  const theme = buildThemeUpdate(body, store.themeConfig);
  if (theme instanceof NextResponse) return { error: theme };
  if (theme) update.themeConfig = theme.themeConfig;

  if (Object.keys(update).length === 0) {
    return { error: badRequest("No valid fields to update", "NO_FIELDS") };
  }

  return { update };
}

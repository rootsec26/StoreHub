import { detectGovernorate, normalizeDestination } from "@/lib/shipping";

/**
 * Flexible shipping / delivery pricing engine.
 *
 * A store picks one of three modes (stores.shipping_mode):
 *  - "disabled" -> checkout never adds a delivery fee (legacy behaviour)
 *  - "flat"     -> one fixed rate for every order (سعر موحد)
 *  - "zones"    -> shipping_flat_rate is the base rate for most areas and
 *                  active shipping_zones rows act as exceptions with their
 *                  own rate (سعر موحد مع استثناءات)
 *
 * This module is intentionally free of server-only imports so the same
 * quote logic can run inside API routes, the checkout page and tests.
 */

export const SHIPPING_MODES = ["disabled", "flat", "zones"] as const;
export type ShippingMode = (typeof SHIPPING_MODES)[number];

export function isShippingMode(value: unknown): value is ShippingMode {
  return (
    typeof value === "string" &&
    (SHIPPING_MODES as readonly string[]).includes(value)
  );
}

export function normalizeShippingMode(value: unknown): ShippingMode {
  return isShippingMode(value) ? value : "disabled";
}

/** Minimal zone shape the quote engine needs (DB row or API record). */
export interface ShippingZoneLike {
  id?: string;
  zoneName: string;
  rate: string | number;
  estimatedDeliveryDays?: number | null;
  isActive?: boolean;
}

export interface ShippingQuote {
  mode: ShippingMode;
  /** Delivery fee in the store's base currency. */
  fee: number;
  /** Base rate that applied before any zone exception (flat mode = fee). */
  baseRate: number;
  /** Zone that won the match, when one did. */
  zoneId: string | null;
  zoneName: string | null;
  estimatedDays: number | null;
  /** True when a shipping_zones exception row priced this quote. */
  zoneMatched: boolean;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function zoneRate(zone: ShippingZoneLike): number {
  const rate = Number(zone.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * Picks the exception zone that best covers a free-text delivery address.
 * Two passes, most specific first:
 *  1. governorate equality — "Cairo" matches "القاهرة، مدينة نصر" via the
 *     shared GOVERNORATES alias table in src/lib/shipping.ts
 *  2. literal substring — custom zone names like "New Cairo" or "6th of
 *     October" match when the address contains the zone name
 * Longest zone names win inside each pass so "North Sinai" beats "Sinai".
 */
export function matchShippingZone<T extends ShippingZoneLike>(
  zones: T[],
  address: string | null | undefined
): T | null {
  const active = zones.filter((zone) => zone.isActive !== false);
  if (active.length === 0 || !address?.trim()) return null;

  const addressGovernorate = detectGovernorate(address);
  if (addressGovernorate) {
    const byGovernorate = [...active]
      .sort((a, b) => b.zoneName.length - a.zoneName.length)
      .find(
        (zone) => detectGovernorate(zone.zoneName) === addressGovernorate
      );
    if (byGovernorate) return byGovernorate;
  }

  const haystack = normalizeDestination(address);
  if (!haystack) return null;

  return (
    [...active]
      .sort((a, b) => b.zoneName.length - a.zoneName.length)
      .find((zone) => {
        const needle = normalizeDestination(zone.zoneName);
        return needle.length >= 3 && haystack.includes(needle);
      }) ?? null
  );
}

/**
 * Resolves the delivery fee for a destination. In "zones" mode an unmatched
 * address pays the merchant's base rate — never more than configured.
 */
export function computeShippingQuote(input: {
  mode: ShippingMode | string | null | undefined;
  flatRate: number | string | null | undefined;
  zones?: ShippingZoneLike[];
  address?: string | null;
}): ShippingQuote {
  const mode = normalizeShippingMode(input.mode);
  const baseRate = roundMoney(Math.max(0, Number(input.flatRate) || 0));

  if (mode === "disabled") {
    return {
      mode,
      fee: 0,
      baseRate,
      zoneId: null,
      zoneName: null,
      estimatedDays: null,
      zoneMatched: false,
    };
  }

  if (mode === "flat") {
    return {
      mode,
      fee: baseRate,
      baseRate,
      zoneId: null,
      zoneName: null,
      estimatedDays: null,
      zoneMatched: false,
    };
  }

  const zone = matchShippingZone(input.zones ?? [], input.address);
  if (zone) {
    return {
      mode,
      fee: roundMoney(zoneRate(zone)),
      baseRate,
      zoneId: zone.id ?? null,
      zoneName: zone.zoneName,
      estimatedDays: zone.estimatedDeliveryDays ?? null,
      zoneMatched: true,
    };
  }

  return {
    mode,
    fee: baseRate,
    baseRate,
    zoneId: null,
    zoneName: null,
    estimatedDays: null,
    zoneMatched: false,
  };
}

/** Storefront-facing summary: enough to render the price-line shipping hint. */
export interface StorefrontShippingInfo {
  mode: ShippingMode | string | null | undefined;
  flatRate: number | string | null | undefined;
  /** Active exception zones exist (zones mode only). */
  hasZoneExceptions: boolean;
}

export type StorefrontShippingDisplay =
  | { kind: "none" }
  | { kind: "free" }
  | { kind: "flat"; rate: number }
  | { kind: "varies" };

/**
 * Decides what the product page should say next to the price:
 *  - disabled / unconfigured        -> nothing
 *  - flat (or zones w/o exceptions) -> "+ {rate} shipping" / "Free shipping"
 *  - zones with exceptions          -> "calculated by your address"
 */
export function storefrontShippingDisplay(
  info: StorefrontShippingInfo | null | undefined
): StorefrontShippingDisplay {
  const mode = normalizeShippingMode(info?.mode);
  if (!info || mode === "disabled") return { kind: "none" };

  const hasExceptions = mode === "zones" && info.hasZoneExceptions;
  if (hasExceptions) return { kind: "varies" };

  const rate = roundMoney(Math.max(0, Number(info.flatRate) || 0));
  if (rate <= 0) return { kind: "free" };
  return { kind: "flat", rate };
}

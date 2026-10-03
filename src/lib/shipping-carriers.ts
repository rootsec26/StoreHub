import {
  CARRIER_PROFILES,
  generateTrackingNumber,
  isShippingCarrier,
  type ShippingCarrier,
} from "@/lib/shipping";
import { decryptSecret } from "@/lib/shipping-crypto";

/**
 * Carrier adapter layer for the shipping aggregation engine.
 *
 * Every carrier is addressed through the same `createCarrierShipment` call:
 *  - credentials configured  → best-effort real carrier API request
 *  - no credentials / error  → deterministic mock provider (sandbox labels)
 *
 * Base URLs can be overridden per environment with
 * `SHIPPING_BOSTA_API_URL`, `SHIPPING_MYLERZ_API_URL`,
 * `SHIPPING_ARAMEX_API_URL`, `SHIPPING_TURBO_API_URL`.
 */

export interface CarrierAccount {
  carrier: ShippingCarrier;
  apiKey: string;
  apiSecret: string;
}

export interface CarrierRecipient {
  name: string;
  phone: string;
  address: string;
  governorate: string;
}

export interface CarrierShipmentPayload {
  /** Stable reference (order id) echoed back by carriers. */
  reference: string;
  recipient: CarrierRecipient;
  sender: { name: string; address: string; phone: string };
  codAmount: number;
  itemsCount: number;
  notes?: string;
}

export interface CarrierShipmentResult {
  trackingNumber: string;
  /** Carrier-hosted shipment page, when the carrier returned one. */
  labelUrl: string | null;
  estimatedDays: number;
  source: "carrier" | "mock";
}

interface CarrierEndpoint {
  envUrl: string;
  defaultUrl: string;
  createPath: string;
  headers: (apiKey: string, apiSecret: string) => Record<string, string>;
  /** Pulls the carrier tracking number out of a loosely-typed JSON body. */
  extractTracking: (body: unknown) => string | null;
}

function nested(body: unknown, path: string): unknown {
  let current: unknown = body;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function firstString(body: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = nested(body, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

const CARRIER_ENDPOINTS: Record<Exclude<ShippingCarrier, "CUSTOM">, CarrierEndpoint> = {
  BOSTA: {
    envUrl: "SHIPPING_BOSTA_API_URL",
    defaultUrl: "https://app.bosta.io",
    createPath: "/api/v2/shipments",
    headers: (apiKey) => ({ Authorization: apiKey }),
    extractTracking: (body) =>
      firstString(body, [
        "data.trackingNumber",
        "trackingNumber",
        "data._id",
        "shipment.trackingNumber",
      ]),
  },
  MYLERZ: {
    envUrl: "SHIPPING_MYLERZ_API_URL",
    defaultUrl: "https://api.mylerz.com",
    createPath: "/api/v1/shipments",
    headers: (apiKey, apiSecret) => ({
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Secret": apiSecret,
    }),
    extractTracking: (body) =>
      firstString(body, [
        "data.trackingNumber",
        "tracking_number",
        "shipment.trackingNumber",
        "waybill",
      ]),
  },
  ARAMEX: {
    envUrl: "SHIPPING_ARAMEX_API_URL",
    defaultUrl: "https://api.aramex.net",
    createPath: "/rest/v1/shipments",
    headers: (apiKey, apiSecret) => ({
      Authorization: `Bearer ${apiKey}`,
      "X-Api-Key": apiKey,
      "X-Api-Secret": apiSecret,
    }),
    extractTracking: (body) =>
      firstString(body, [
        "shipment.id",
        "shipment.trackingNumber",
        "data.trackingNumber",
        "trackingNumber",
        "awbNumber",
      ]),
  },
  TURBO: {
    envUrl: "SHIPPING_TURBO_API_URL",
    defaultUrl: "https://api.turbo-eg.net",
    createPath: "/api/v1/shipments",
    headers: (apiKey, apiSecret) => ({
      Authorization: `Token ${apiKey}`,
      "X-Secret": apiSecret,
    }),
    extractTracking: (body) =>
      firstString(body, [
        "data.trackingNumber",
        "data.waybill",
        "waybill",
        "trackingNumber",
      ]),
  },
};

/** Sandbox tracking number: `BOS261003K7X9Q2` style, digits + uppercase. */
export function generateCarrierTrackingNumber(carrier: ShippingCarrier): string {
  const profile = CARRIER_PROFILES[carrier] ?? CARRIER_PROFILES.CUSTOM;
  return generateTrackingNumber(profile.prefix);
}

function mockResult(carrier: ShippingCarrier): CarrierShipmentResult {
  return {
    trackingNumber: generateCarrierTrackingNumber(carrier),
    labelUrl: null,
    estimatedDays:
      CARRIER_PROFILES[carrier]?.transitDays ?? CARRIER_PROFILES.CUSTOM.transitDays,
    source: "mock",
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 12000
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Carrier API ${response.status}: ${text.slice(0, 240)}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { raw: text };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Builds the generic shipment body every adapter translates on its side. */
function buildCarrierBody(account: CarrierAccount, payload: CarrierShipmentPayload) {
  return {
    reference: payload.reference,
    codAmount: payload.codAmount,
    items: payload.itemsCount,
    description: payload.notes || `Shipment ${payload.reference}`,
    consignee: {
      name: payload.recipient.name,
      phone: payload.recipient.phone,
      addressLine: payload.recipient.address,
      governorate: payload.recipient.governorate,
      country: "EG",
    },
    shipper: {
      name: payload.sender.name,
      phone: payload.sender.phone,
      addressLine: payload.sender.address,
      country: "EG",
    },
    credentials: { key: account.apiKey, secret: account.apiSecret ? "•••" : "" },
  };
}

/**
 * Creates a shipment with the given carrier account.
 * Falls back to the mock provider whenever the real API is unavailable so
 * bulk fulfillment never blocks a merchant's dispatch run.
 */
export async function createCarrierShipment(
  account: CarrierAccount,
  payload: CarrierShipmentPayload
): Promise<CarrierShipmentResult> {
  if (account.carrier === "CUSTOM" || !account.apiKey) {
    return mockResult(account.carrier);
  }

  const endpoint = CARRIER_ENDPOINTS[account.carrier];
  if (!endpoint) return mockResult(account.carrier);

  try {
    const baseUrl =
      process.env[endpoint.envUrl] || endpoint.defaultUrl;
    const body = await postJson(
      `${baseUrl.replace(/\/$/, "")}${endpoint.createPath}`,
      endpoint.headers(account.apiKey, account.apiSecret),
      buildCarrierBody(account, payload)
    );

    const trackingNumber = endpoint.extractTracking(body);
    if (!trackingNumber) {
      throw new Error("Carrier response did not include a tracking number");
    }

    const labelUrl = firstString(body, [
      "data.labelUrl",
      "labelUrl",
      "data.label_url",
      "shipment.labelUrl",
    ]);

    return {
      trackingNumber,
      labelUrl: labelUrl ?? null,
      estimatedDays:
        CARRIER_PROFILES[account.carrier]?.transitDays ??
        CARRIER_PROFILES.CUSTOM.transitDays,
      source: "carrier",
    };
  } catch (error) {
    console.warn(
      `[shipping] ${account.carrier} API unavailable, using mock provider:`,
      error instanceof Error ? error.message : error
    );
    return mockResult(account.carrier);
  }
}

/** Decrypts stored credentials into an adapter account (never logged). */
export function toCarrierAccount(row: {
  carrier: string;
  apiKey: string | null;
  apiSecret: string | null;
}): CarrierAccount {
  const carrier: ShippingCarrier = isShippingCarrier(row.carrier)
    ? row.carrier
    : "CUSTOM";
  return {
    carrier,
    apiKey: decryptSecret(row.apiKey),
    apiSecret: decryptSecret(row.apiSecret),
  };
}

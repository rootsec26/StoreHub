import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  aiChatSessions,
  orderItems,
  orders,
  products,
  shippingZones,
  stores,
  type AiChatMessage,
  type AiChatSessionStatus,
  type ExtractedOrderData,
  type SocialPlatform,
} from "@/db/schema";
import { GOVERNORATES, detectGovernorate } from "@/lib/shipping";
import { deductWarehouseStockForOrder } from "@/lib/warehouses-server";

/**
 * AI Social Selling & Conversational Checkout Engine.
 *
 * Orchestrates a function-calling agent (OpenAI Chat Completions, mirroring
 * src/lib/ai.ts) that sells through Facebook Messenger / Instagram DM /
 * WhatsApp using the store's live catalog:
 *
 *   searchProducts(query)         -> real products, prices and stock
 *   calculateShipping(governorate) -> live shipping zone rates
 *   createDraftOrder(details)     -> a real Pending order in StoreHub
 *
 * When `OPENAI_API_KEY` is not configured (or the call fails) a deterministic
 * Arabic rule-based agent takes over so the engine keeps working in local /
 * demo environments — the same mock-first contract as every other AI feature.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY_MESSAGES = 20;
const MAX_REPLY_CHARS = 1800;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ProductHit {
  id: string;
  name: string;
  price: number;
  stock: number;
  inStock: boolean;
  imageUrl: string;
  score: number;
}

export interface ShippingQuote {
  governorate: string | null;
  zoneId: string | null;
  zoneName: string | null;
  fee: number | null;
  currency: string;
  estimatedDays: number | null;
}

export interface DraftOrderItemInput {
  productId?: string;
  name: string;
  quantity?: number;
  size?: string;
}

export interface DraftOrderResult {
  orderId: string;
  total: number;
  items: { productId: string; name: string; quantity: number; unitPrice: number }[];
  skipped: string[];
}

/** Extracted order data plus transient parse hints (never persisted). */
export interface PendingOrderHints {
  pendingSize?: string;
  pendingQuantity?: number;
}

export interface SocialBotParams {
  storeId: string;
  platform: SocialPlatform;
  customerRef: string;
  customerName?: string;
  message: string;
  personaPrompt?: string | null;
  origin?: string;
}

export interface SocialBotResult {
  reply: string | null;
  source: "openai" | "rule" | "skipped";
  status: AiChatSessionStatus;
  sessionId: string | null;
  orderId: string | null;
  extracted: ExtractedOrderData;
  toolCalls: string[];
}

export class DraftOrderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DraftOrderError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Arabic / Egyptian text helpers
// ---------------------------------------------------------------------------

/** Folds casing, diacritics and alef/ya/ta-marbuta variants for matching. */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function stripArticle(value: string): string {
  return value.replace(/^(ال|أل)/, "");
}

/**
 * Canonical governorate lookup that also matches bare colloquial mentions
 * such as "لإسكندرية" (no article) which `detectGovernorate` misses.
 */
export function resolveGovernorate(
  ...candidates: (string | null | undefined)[]
): string | null {
  const direct = detectGovernorate(...candidates);
  if (direct) return direct;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const haystack = foldText(candidate);
    for (const governorate of GOVERNORATES) {
      for (const alias of governorate.aliases) {
        const needle = stripArticle(foldText(alias));
        if (needle.length >= 4 && haystack.includes(needle)) {
          return governorate.name;
        }
      }
    }
  }
  return null;
}

const GOVERNORATE_ALIASES: Record<string, string[]> = {};
for (const governorate of GOVERNORATES) {
  GOVERNORATE_ALIASES[governorate.name] = governorate.aliases;
}

const PHONE_PATTERN = /(?:\+?20|0020|0)?1[0125]\d{8}/g;
const SIZE_PATTERN = /مقاس\s*([a-z0-9]{1,4})/i;
const QUANTITY_PATTERNS = [
  /(\d{1,2})\s*(?:قطعة|قطع|حزمة|حبة|pcs|piece)/i,
  /(\d{1,2})\s*x\s*(?=[\p{L}])/iu,
];

const INTENT_STOPWORDS = new Set([
  "عايز",
  "عايزة",
  "اريد",
  "ابغى",
  "ابغي",
  "بدي",
  "اطلب",
  "اشتري",
  "نشتري",
  "ممكن",
  "لو",
  "سمحت",
  "بليز",
  "الطلب",
  "طلب",
  "المنتجات",
  "و",
  "في",
  "من",
  "الى",
  "على",
  "عن",
  "مع",
  "هذا",
  "اللي",
  "الذي",
  "please",
  "want",
  "buy",
  "order",
  "the",
  "and",
  "for",
  "with",
]);

const CONTACT_KEYWORDS = [
  "هاتف",
  "هاتفي",
  "رقم",
  "رقمي",
  "موبايل",
  "تليفون",
  "تيليفون",
  "phone",
  "tel",
];

const HANDOVER_PATTERNS = [
  "كلم انسان",
  "اتكلم مع حد",
  "مع حد يرد",
  "انسان حقيقي",
  "خلي حد يرد",
  "اتواصل مع المدير",
  "human",
  "real person",
];

const NAME_PREFIX_PATTERN =
  /(?:باسم|اسمي|اسم العميل|الاسم|my name is|name is|name)\s+([^0-9\n,؛.]{2,60})/i;

/**
 * Pulls name / phone / city / street / size / quantity out of a customer
 * message, merging anything already parsed in earlier turns.
 */
export function extractCustomerDetails(
  text: string,
  previous?: (ExtractedOrderData & PendingOrderHints) | null
): ExtractedOrderData & PendingOrderHints {
  const merged: ExtractedOrderData & PendingOrderHints = {
    items: previous?.items ? previous.items.map((item) => ({ ...item })) : [],
    address: previous?.address ?? "",
    phone: previous?.phone ?? "",
    name: previous?.name ?? "",
    governorate: previous?.governorate ?? undefined,
    pendingSize: previous?.pendingSize,
    pendingQuantity: previous?.pendingQuantity,
  };

  if (!text) return merged;

  // Phone — strip non-digits first so "0101 234 5678" still matches.
  const digitRun = text.replace(/[^\d+]/g, "");
  const phoneMatch = digitRun.match(/(?:\+?20|0020)?0?1[0125]\d{8}/);
  if (phoneMatch) {
    const raw = phoneMatch[0].replace(/\D/g, "");
    merged.phone = raw.startsWith("20") && raw.length === 12 ? `0${raw.slice(2)}` : raw;
  } else {
    const loose = text.match(PHONE_PATTERN);
    if (loose && loose[0].replace(/\D/g, "").length >= 10) {
      merged.phone = loose[0].replace(/\D/g, "");
    }
  }

  // Full name after باسم / اسمي / name is ... — stops at contact keywords,
  // digits or clause punctuation.
  const nameMatch = text.match(NAME_PREFIX_PATTERN);
  if (nameMatch) {
    let name = nameMatch[1];
    for (const keyword of CONTACT_KEYWORDS) {
      const index = name.toLowerCase().indexOf(keyword);
      if (index > 0) name = name.slice(0, index);
    }
    name = name
      .replace(/\s+/g, " ")
      .replace(/[،,.!؟?]+$/, "")
      .trim();
    if (name.length >= 3) merged.name = name;
  }

  // Governorate / city.
  const governorate = resolveGovernorate(text, merged.address);
  if (governorate) merged.governorate = governorate;

  // Street address after عنوان / شارع / حي.
  const addressMatch = text.match(
    /(?:العنوان|عنواني|على شارع|شارع|في حي|address)\s+([^0-9\n,؛]{3,80})/i
  );
  if (addressMatch) {
    const address = addressMatch[1]
      .replace(/\s+/g, " ")
      .replace(/[،,.!؟?]+$/, "")
      .trim();
    if (address.length >= 3) merged.address = address;
  } else if (governorate && !merged.address) {
    merged.address = governorate;
  }

  // Size — products have no variants table yet, so size/color ride on the
  // order note and the extracted item.
  const sizeMatch = text.match(SIZE_PATTERN);
  const size = sizeMatch?.[1]?.toUpperCase();

  // Quantity — only from explicit quantity phrasing so a phone number can
  // never be mistaken for "2 pieces".
  let quantity = 0;
  for (const pattern of QUANTITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed > 0 && parsed < 100) quantity = parsed;
      break;
    }
  }

  if (size) merged.pendingSize = size;
  if (quantity > 0) merged.pendingQuantity = quantity;

  const last = merged.items[merged.items.length - 1];
  if (last) {
    if (size) last.size = size;
    if (quantity > 0) last.quantity = quantity;
  }

  return merged;
}

function cleanExtraction(
  value: ExtractedOrderData & PendingOrderHints
): ExtractedOrderData {
  return {
    items: (value.items ?? []).map((item) => ({
      ...item,
      quantity: item.quantity > 0 ? Math.min(99, Math.floor(item.quantity)) : 1,
    })),
    address: value.address ?? "",
    phone: value.phone ?? "",
    name: value.name ?? "",
    governorate: value.governorate ?? undefined,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes parsed details from the message so only the product query remains. */
function buildProductQuery(
  text: string,
  details: ExtractedOrderData,
  governorate: string | null
): string {
  let rest = text.replace(PHONE_PATTERN, " ").replace(/\b\d{10,}\b/g, " ");

  if (details.name) {
    rest = rest.replace(new RegExp(escapeRegExp(details.name), "gi"), " ");
  }
  if (details.address && details.address !== governorate) {
    rest = rest.replace(new RegExp(escapeRegExp(details.address), "gi"), " ");
  }

  rest = rest.replace(/مقاس\s*[a-z0-9]{1,4}/gi, " ");
  rest = rest.replace(
    /(?:العنوان|عنواني|باسم|اسمي|اسم العميل|الاسم|هاتفي?|رقمي?|موبايل|تليفون|تيليفون)/gi,
    " "
  );

  const tokens = rest.split(/[^\p{L}\p{N}]+/u).filter((token) => {
    const folded = foldText(token);
    if (!folded || folded.length < 3) return false;
    if (/^\d+$/.test(folded)) return false;
    if (INTENT_STOPWORDS.has(folded)) return false;

    if (governorate) {
      const aliases = GOVERNORATE_ALIASES[governorate] ?? [governorate];
      const needles = aliases.map((alias) => stripArticle(foldText(alias)));
      needles.push(stripArticle(foldText(governorate)));
      for (const needle of needles) {
        if (needle.length >= 4 && folded.includes(needle)) return false;
      }
    }
    return true;
  });

  return tokens.join(" ");
}

// ---------------------------------------------------------------------------
// Tool 1 — searchProducts (live catalog search with Arabic-aware ranking)
// ---------------------------------------------------------------------------

/**
 * Collapses frequent transliteration variants so catalog and query side agree:
 * تيشيرت -> تيشرت, تشورت -> تيشرت (Egyptian shoppers spell both ways).
 */
function canonicalizeSpelling(value: string): string {
  return value.replace(/شي(?=ر)/g, "ش").replace(/شو(?=ر)/g, "ش");
}

/** Canonical text used for catalog matching (fold + spelling variants). */
export function canonicalSearchText(value: string): string {
  return canonicalizeSpelling(foldText(value));
}

function normalizeQueryText(text: string): string {
  return canonicalizeSpelling(foldText(text))
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchTerms(query: string): string[] {
  const folded = normalizeQueryText(query);
  if (!folded) return [];

  const tokens = folded.split(" ").filter((token) => token.length > 1);
  const stripped = tokens.map((token) => stripArticle(token)).filter(Boolean);

  const terms = new Set<string>();
  if (folded.length > 2) terms.add(folded);
  if (stripped.length > 0) terms.add(stripped.join(" "));
  for (const token of stripped) {
    if (token.length >= 3) terms.add(token);
  }

  return Array.from(terms);
}

export async function searchProducts(
  storeId: string,
  query: string,
  limit = 6
): Promise<ProductHit[]> {
  const terms = buildSearchTerms(query);
  if (terms.length === 0) return [];

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      stock: products.stock,
      imageUrl: products.imageUrl,
      isVisible: products.isVisible,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.storeId, storeId))
    .orderBy(desc(products.stock), desc(products.createdAt))
    .limit(400);

  const fullQuery = normalizeQueryText(query);

  const scored = rows
    .filter((row) => row.isVisible !== false)
    .map((row) => {
      const name = canonicalSearchText(row.name);
      const description = canonicalSearchText(row.description ?? "");
      let score = 0;
      let matched = false;

      if (fullQuery && name.includes(fullQuery)) {
        score += 6;
        matched = true;
      }
      for (const term of terms) {
        if (name.includes(term)) {
          score += 4;
          matched = true;
        } else if (description.includes(term)) {
          score += 1;
          matched = true;
        }
      }
      if (row.stock > 0) score += 2;

      return {
        id: row.id,
        name: row.name,
        price: parseFloat(row.price) || 0,
        stock: row.stock,
        inStock: row.stock > 0,
        imageUrl: row.imageUrl ?? "",
        score,
        matched,
      };
    })
    .filter((hit) => hit.matched)
    .map(({ matched: _matched, ...hit }) => hit)
    .sort((a, b) => b.score - a.score || Number(b.inStock) - Number(a.inStock));

  return scored.slice(0, limit);
}

/** Newest visible products — used as "you may like" fallbacks. */
export async function listTopProducts(storeId: string, limit = 4): Promise<ProductHit[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      stock: products.stock,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(eq(products.storeId, storeId))
    .orderBy(desc(products.stock), desc(products.createdAt))
    .limit(limit);

  return rows
    .filter((row) => row.stock > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      price: parseFloat(row.price) || 0,
      stock: row.stock,
      inStock: row.stock > 0,
      imageUrl: row.imageUrl ?? "",
      score: 0,
    }));
}

// ---------------------------------------------------------------------------
// Tool 2 — calculateShipping (live shipping zone rates)
// ---------------------------------------------------------------------------

export async function calculateShipping(
  storeId: string,
  governorateInput: string
): Promise<ShippingQuote> {
  const storeRows = await db
    .select({ currency: stores.currency })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  const currency = storeRows[0]?.currency ?? "EGP";

  const canonical = resolveGovernorate(governorateInput);
  const zones = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.storeId, storeId));

  const active = zones.filter((zone) => zone.isActive !== false);
  const emptyQuote: ShippingQuote = {
    governorate: canonical,
    zoneId: null,
    zoneName: null,
    fee: null,
    currency,
    estimatedDays: null,
  };

  if (active.length === 0) return emptyQuote;

  let zone =
    canonical !== null
      ? active.find((candidate) => resolveGovernorate(candidate.zoneName) === canonical)
      : undefined;

  if (!zone && canonical !== null) {
    const foldedTarget = foldText(canonical);
    zone = active.find((candidate) => {
      const foldedZone = foldText(candidate.zoneName);
      return foldedZone.includes(foldedTarget) || foldedTarget.includes(foldedZone);
    });
  }

  if (!zone) return emptyQuote;

  return {
    governorate: canonical ?? zone.zoneName,
    zoneId: zone.id,
    zoneName: zone.zoneName,
    fee: parseFloat(zone.rate) || 0,
    currency,
    estimatedDays: zone.estimatedDeliveryDays,
  };
}

// ---------------------------------------------------------------------------
// Tool 3 — createDraftOrder (chat inquiry -> real Pending order)
// ---------------------------------------------------------------------------

async function loadStoreProduct(storeId: string, productId: string) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      stock: products.stock,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
    .limit(1);
  return rows[0];
}

export async function createDraftOrder(params: {
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: DraftOrderItemInput[];
  note?: string;
}): Promise<DraftOrderResult> {
  const requested = (params.items ?? []).filter((item) => item && item.name);
  if (requested.length === 0) {
    throw new DraftOrderError("NO_ITEMS", "لا يمكن إنشاء طلب بدون منتجات.");
  }

  const resolved: { productId: string; name: string; quantity: number; unitPrice: number }[] = [];
  const skipped: string[] = [];

  for (const item of requested) {
    const quantity = Math.max(1, Math.min(99, Math.floor(item.quantity ?? 1)));

    let row = item.productId ? await loadStoreProduct(params.storeId, item.productId) : undefined;

    if (!row) {
      const hits = await searchProducts(params.storeId, item.name, 1);
      if (hits.length > 0) row = await loadStoreProduct(params.storeId, hits[0].id);
    }

    if (!row) {
      skipped.push(`${item.name} (غير متاح)`);
      continue;
    }

    if (row.stock <= 0) {
      skipped.push(`${row.name} (نفد المخزون)`);
      continue;
    }

    if (row.stock < quantity) {
      resolved.push({
        productId: row.id,
        name: row.name,
        quantity: row.stock,
        unitPrice: parseFloat(row.price) || 0,
      });
      skipped.push(`${row.name} (الكمية المتاحة ${row.stock} فقط)`);
      continue;
    }

    resolved.push({
      productId: row.id,
      name: row.name,
      quantity,
      unitPrice: parseFloat(row.price) || 0,
    });
  }

  if (resolved.length === 0) {
    throw new DraftOrderError("OUT_OF_STOCK", "لا توجد منتجات متاحة حاليًا لإنشاء الطلب.");
  }

  const total = resolved.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const orderResult = await db
    .insert(orders)
    .values({
      storeId: params.storeId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerAddress: params.customerAddress,
      notes: [params.note ?? "", "AI chat order (Social Selling Engine)"]
        .filter(Boolean)
        .join(" — "),
      totalAmount: total.toFixed(2),
      status: "Pending",
      paymentMethod: "cod",
      channel: "online",
    })
    .returning();

  const order = orderResult[0];

  await db.insert(orderItems).values(
    resolved.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
    }))
  );

  try {
    await deductWarehouseStockForOrder({
      storeId: params.storeId,
      customerAddress: params.customerAddress,
      items: resolved.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
  } catch (error) {
    console.warn("Warehouse deduction skipped for chat order:", error);
  }

  return { orderId: order.id, total, items: resolved, skipped };
}

// ---------------------------------------------------------------------------
// System prompt + OpenAI function calling
// ---------------------------------------------------------------------------

function resolveDialect(personaPrompt: string | null | undefined): string {
  const persona = foldText(personaPrompt ?? "");
  if (!persona) return "اللهجة المصرية العامية الودودة";
  if (/رسمي|فصحى|formal|msa/.test(persona)) return "الفصحى الحديثة الرسمية";
  return "اللهجة المصرية العامية الودودة";
}

export function buildSystemPrompt(params: {
  storeName: string;
  platform: SocialPlatform;
  currency: string;
  personaPrompt?: string | null;
}): string {
  const platformLabel =
    params.platform === "WHATSAPP"
      ? "واتساب"
      : params.platform === "INSTAGRAM"
        ? "إنستجرام"
        : "فيسبوك ماسنجر";
  const dialect = resolveDialect(params.personaPrompt);

  return [
    `أنت مساعد مبيعات ذكي يمثّل متجر "${params.storeName}" على ${platformLabel}.`,
    `اتجاه الرد: ${dialect}. رد قصير وواضح ومناسب للمحادثات السريعة (أقل من 1800 حرف).`,
    "مهمتك: الإجابة عن استفسارات العملاء، عرض المنتجات والأسعار والمخزون الحقيقية، حساب مصاريف الشحن، ثم إنشاء الطلب مباشرة داخل المحادثة.",
    "قواعد صارمة:",
    "1) استخدم أدواتك (searchProducts / calculateShipping / createDraftOrder) للحصول على بيانات حقيقية من قاعدة البيانات — لا تختلق اسم منتج أو سعرًا أو مخزونًا أبدًا.",
    "2) اجمع تفاصيل الطلب تدريجيًا من كلام العميل: الاسم، رقم الهاتف (المصري يبدأ بـ 01)، المحافظة، والعنوان، والمقاس/اللون والكمية.",
    "3) لا تطلب بريدًا إلكترونيًا ولا تسأل عن بيانات لا تحتاجها للشحن.",
    "4) بعد اكتمال (الاسم + الهاتف + منتج واحد على الأقل) وموافقة العميل على الشراء، أنشئ الطلب عبر createDraftOrder فورًا وأبلغه برقم الطلب والإجمالي.",
    "5) إذا نفد المخزون صرّح بذلك واقترح بديلًا من نفس الفئة.",
    "6) مصاريف الشحن تُحسب من المحافظة عبر الأداة ولا تُخمّن أبدًا.",
    params.personaPrompt ? `تعليمات المتجر الخاصة:\n${params.personaPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface OpenAIToolCall {
  id: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "searchProducts",
      description:
        "ابحث في كتالوج المتجر عن منتجات مطابقة مع السعر والمخزون الحالي. استخدمها قبل الإجابة على أي سؤال عن منتج أو سعر أو توفر.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "كلمات البحث كما كتبها العميل" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateShipping",
      description:
        "احسب مصاريف الشحن وعدد أيام التوصيل لمحافظة محددة باستخدام مناطق الشحن الفعلية للمتجر.",
      parameters: {
        type: "object",
        properties: {
          governorate: {
            type: "string",
            description: "اسم المحافظة بالعربية أو الإنجليزية",
          },
        },
        required: ["governorate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createDraftOrder",
      description:
        "حوّل محادثة العميل إلى طلب حقيقي معلّق (Pending) في لوحة تحكم المتجر. استدعِها فقط بعد اكتمال الاسم والهاتف والمنتجات.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          phone: { type: "string" },
          address: { type: "string", description: "العنوان بالتفصيل مع المحافظة" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                name: { type: "string" },
                quantity: { type: "integer", minimum: 1 },
                size: { type: "string" },
              },
              required: ["name", "quantity"],
            },
          },
          note: { type: "string", description: "ملاحظة الطلب مثل المقاس أو اللون" },
        },
        required: ["customerName", "phone", "address", "items"],
      },
    },
  },
];

interface AgentContext {
  storeId: string;
  currency: string;
  origin?: string;
  extracted: ExtractedOrderData & PendingOrderHints;
  toolCalls: string[];
  orderId: string | null;
  orderTotal: number | null;
}

async function executeToolCall(
  call: OpenAIToolCall,
  ctx: AgentContext
): Promise<unknown> {
  const name = call.function?.name ?? "";
  let args: Record<string, unknown> = {};
  try {
    args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    args = {};
  }

  try {
    if (name === "searchProducts") {
      const rawQuery = String(args.query ?? "");
      const hits = await searchProducts(ctx.storeId, rawQuery, 6);
      ctx.toolCalls.push(`searchProducts(${rawQuery})`);
      return hits.map((hit) => ({
        id: hit.id,
        name: hit.name,
        price: hit.price,
        stock: hit.stock,
        inStock: hit.inStock,
      }));
    }

    if (name === "calculateShipping") {
      const rawGovernorate = String(args.governorate ?? "");
      const quote = await calculateShipping(ctx.storeId, rawGovernorate);
      ctx.toolCalls.push(`calculateShipping(${rawGovernorate})`);
      return quote;
    }

    if (name === "createDraftOrder") {
      const rawItems = Array.isArray(args.items)
        ? (args.items as Record<string, unknown>[])
        : [];
      const items: DraftOrderItemInput[] = rawItems.map((item) => ({
        productId: typeof item.productId === "string" ? item.productId : undefined,
        name: String(item.name ?? ""),
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        size: typeof item.size === "string" ? item.size : undefined,
      }));

      const result = await createDraftOrder({
        storeId: ctx.storeId,
        customerName: String(args.customerName ?? "").trim() || "عميل اجتماعي",
        customerPhone: String(args.phone ?? "").trim(),
        customerAddress: String(args.address ?? "").trim(),
        items,
        note: typeof args.note === "string" ? args.note : "",
      });

      ctx.toolCalls.push(`createDraftOrder(${result.items.length} items)`);
      ctx.orderId = result.orderId;
      ctx.orderTotal = result.total;
      ctx.extracted = cleanExtraction({
        ...ctx.extracted,
        name: String(args.customerName ?? ctx.extracted.name),
        phone: String(args.phone ?? ctx.extracted.phone),
        address: String(args.address ?? ctx.extracted.address),
        items: result.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      return {
        ok: true,
        orderId: result.orderId,
        total: result.total,
        currency: ctx.currency,
        skipped: result.skipped,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر تنفيذ الأداة";
    return { ok: false, error: message };
  }

  return { ok: false, error: `unknown tool: ${name}` };
}

async function runOpenAiAgent(params: {
  storeName: string;
  platform: SocialPlatform;
  currency: string;
  personaPrompt: string | null | undefined;
  history: AiChatMessage[];
  message: string;
  ctx: AgentContext;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        storeName: params.storeName,
        platform: params.platform,
        currency: params.currency,
        personaPrompt: params.personaPrompt,
      }),
    },
  ];

  for (const entry of params.history.slice(-MAX_HISTORY_MESSAGES)) {
    messages.push({ role: entry.role, content: entry.content });
  }
  messages.push({ role: "user", content: params.message });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
          messages,
          tools: OPENAI_TOOLS,
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 700,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`OpenAI agent request failed with status ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: { message?: OpenAIMessage }[];
      };
      const message = payload.choices?.[0]?.message;
      if (!message) return null;

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        for (const call of message.tool_calls) {
          const result = await executeToolCall(call, params.ctx);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      const content = message.content?.trim();
      if (!content) return null;
      return content
        .replace(/^```(?:json|text)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }
  } catch (error) {
    console.warn("OpenAI agent request error:", error);
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Deterministic rule-based agent (mock mode / API fallback)
// ---------------------------------------------------------------------------

type Intent = "greeting" | "shipping" | "stock" | "buy" | "handover" | "other";

function classifyIntent(text: string): Intent {
  const folded = foldText(text);

  for (const pattern of HANDOVER_PATTERNS) {
    if (folded.includes(foldText(pattern))) return "handover";
  }

  if (/(شحن|توصيل|يوصل|shipping|delivery|deliver)/.test(folded)) return "shipping";
  if (
    /(عايز|اريد|ابغى|ابغي|بدي|اطلب|اشتري|ممكن اطلب|ازاي اطلب|كيف اطلب|اعمل طلب|buy|order now|want to)/.test(
      folded
    )
  ) {
    return "buy";
  }
  if (/(سعر|بكام|كام|متوفر|متاح|available|price|stock|in stock)/.test(folded)) {
    return "stock";
  }
  if (/^(مرحبا|السلام عليكم|سلام|اهلا|هاي|صباح الخير|مساء الخير|hi|hello|hey)/.test(folded)) {
    return "greeting";
  }
  return "other";
}

function formatPrice(value: number, currency: string): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded} ${currency}`;
}

function hasCustomerDetails(details: ExtractedOrderData): boolean {
  return Boolean(details.name.trim() && details.phone.trim() && details.items.length > 0);
}

function mergeHitsIntoItems(
  details: ExtractedOrderData & PendingOrderHints,
  hits: ProductHit[]
): void {
  if (hits.length === 0) return;
  const first = hits[0];
  const size = details.pendingSize;
  const quantity = details.pendingQuantity && details.pendingQuantity > 0
    ? details.pendingQuantity
    : undefined;

  const existingIndex = details.items.findIndex((item) =>
    hits.some((hit) => hit.id === item.productId)
  );

  if (existingIndex >= 0) {
    const item = details.items[existingIndex];
    if (size) item.size = size;
    if (quantity) item.quantity = quantity;
    item.unitPrice = first.price;
    return;
  }

  if (details.items.length >= 6) return;

  details.items.push({
    productId: first.id,
    name: first.name,
    quantity: quantity ?? 1,
    unitPrice: first.price,
    ...(size ? { size } : {}),
  });
}

async function runRuleBasedAgent(params: {
  storeId: string;
  storeName: string;
  currency: string;
  message: string;
  ctx: AgentContext;
}): Promise<{ reply: string; extracted: ExtractedOrderData }> {
  const { message, ctx } = params;
  const intent = classifyIntent(message);

  const parsed = extractCustomerDetails(message, ctx.extracted);
  const governorate = parsed.governorate ?? null;

  // Product query = message minus everything already parsed out.
  const productQuery = buildProductQuery(message, parsed, governorate);
  const wantsProduct =
    intent === "buy" ||
    intent === "stock" ||
    (intent === "other" && productQuery.split(" ").filter(Boolean).length > 0);

  const hits =
    wantsProduct && productQuery ? await searchProducts(params.storeId, productQuery, 4) : [];

  if (hits.length > 0) mergeHitsIntoItems(parsed, hits);

  ctx.extracted = cleanExtraction(parsed);
  const extracted = ctx.extracted;

  // --- handover -----------------------------------------------------------
  if (intent === "handover") {
    return {
      reply: "تمام، هحوّلك لمسؤول المتجر دلوقتي وهيفضل معاك في المحادثة ✅",
      extracted,
    };
  }

  // --- greeting -----------------------------------------------------------
  if (intent === "greeting" && !productQuery) {
    return {
      reply: `أهلاً وسهلاً بيك في ${params.storeName} 👋\nأقدر أساعدك في اختيار المنتجات، أسعارها، المخزون، ومصاريف الشحن، وكمان أطلبلك من هنا مباشرة. إيه اللي يناسبك؟`,
      extracted,
    };
  }

  // --- conversational checkout -------------------------------------------
  const wantsCheckout =
    intent === "buy" &&
    hasCustomerDetails(extracted) &&
    (message.includes("طلب") ||
      /اطلب|ازاي اطلب|كيف اطلب|اعمل طلب|confirm|checkout/.test(foldText(message)) ||
      hits.length > 0);

  if (wantsCheckout) {
    try {
      const quote = governorate
        ? await calculateShipping(params.storeId, governorate)
        : null;

      const noteFragments = extracted.items
        .map((item) =>
          [item.name, item.size ? `مقاس ${item.size}` : ""].filter(Boolean).join(" ")
        )
        .join("، ");

      const addressLine = Array.from(
        new Set([extracted.address, extracted.governorate].filter(Boolean))
      ).join("، ");

      const result = await createDraftOrder({
        storeId: params.storeId,
        customerName: extracted.name,
        customerPhone: extracted.phone,
        customerAddress: addressLine,
        items: extracted.items,
        note: noteFragments,
      });

      ctx.orderId = result.orderId;
      ctx.orderTotal = result.total;
      ctx.toolCalls.push(`createDraftOrder(${result.items.length} items)`);
      if (quote) ctx.toolCalls.push(`calculateShipping(${governorate ?? ""})`);

      const shippingLine =
        quote && quote.fee !== null
          ? `الشحن لـ ${quote.governorate}: ${formatPrice(quote.fee, quote.currency)}${
              quote.estimatedDays ? ` (خلال ${quote.estimatedDays} أيام)` : ""
            }`
          : governorate
            ? `الشحن لـ ${governorate}: هيتاكد مع تأكيد الطلب.`
            : "";

      const lines = [
        `تمام يا فندم ✅ تم إنشاء طلبك في ${params.storeName}.`,
        "",
        `رقم الطلب: ${result.orderId.slice(0, 8).toUpperCase()}`,
        `المنتجات: ${result.items
          .map((item) => `${item.quantity} × ${item.name}`)
          .join("، ")}`,
        `الإجمالي: ${formatPrice(result.total, params.currency)}`,
        shippingLine,
        `الاسم: ${extracted.name}`,
        `التليفون: ${extracted.phone}`,
        `العنوان: ${addressLine}`,
        "",
        "الدفع عند الاستلام — هنتواصل معاك لتأكيد الموعد. لو عايز تغيير أي حاجة قولّي 🙌",
      ].filter(Boolean);

      const skippedNote = result.skipped.length
        ? `\nملاحظات: ${result.skipped.join("، ")}`
        : "";

      return { reply: `${lines.join("\n")}${skippedNote}`, extracted };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "تعذّر إنشاء الطلب";
      return {
        reply: `محتاج أكمّل كام بيانات قبل الطلب: ${reason}\nابعتلي اسمك الكامل ورقم تليفونك والمحافظة والعنوان بالتفصيل وهسجّلك الطلب فورًا.`,
        extracted,
      };
    }
  }

  // --- product / stock / price questions ----------------------------------
  if (hits.length > 0) {
    const list = hits
      .map(
        (hit, index) =>
          `${index + 1}. ${hit.name} — ${formatPrice(hit.price, params.currency)} ${
            hit.inStock ? `(متاح، ${hit.stock} قطعة)` : "(نفد المخزون)"
          }`
      )
      .join("\n");

    const quote = governorate ? await calculateShipping(params.storeId, governorate) : null;
    ctx.toolCalls.push(`searchProducts(${productQuery})`);
    if (quote && governorate) ctx.toolCalls.push(`calculateShipping(${governorate})`);

    const askDetails = hasCustomerDetails(extracted)
      ? "لو حابب تكمل، قولّي «أطلب» وهجهّلك الطلب فورًا."
      : "لو حابب تطلبه، ابعتلي: اسمك، رقم تليفونك، والمحافظة والعنوان.";

    const shippingLine =
      quote && quote.fee !== null
        ? `\n🚚 الشحن لـ ${quote.governorate}: ${formatPrice(quote.fee, quote.currency)}`
        : "";

    return {
      reply: `نتائج بحثك في ${params.storeName}:\n${list}${shippingLine}\n\n${askDetails}`,
      extracted,
    };
  }

  // --- nothing matched the query -----------------------------------------
  if (wantsProduct && productQuery && hits.length === 0) {
    const suggestions = await listTopProducts(params.storeId, 3);
    const list = suggestions
      .map((hit) => `• ${hit.name} — ${formatPrice(hit.price, params.currency)}`)
      .join("\n");

    ctx.toolCalls.push(`searchProducts(${productQuery})`);

    return {
      reply: `مفيش نتائج مطابقة لـ «${productQuery}» دلوقتي.${
        list ? `\nممكن يعجبك:\n${list}` : ""
      }\nقوليلي الفئة أو استخدامك وأرشّحلك الأفضل.`,
      extracted,
    };
  }

  // --- shipping question --------------------------------------------------
  if (intent === "shipping") {
    if (governorate) {
      const quote = await calculateShipping(params.storeId, governorate);
      ctx.toolCalls.push(`calculateShipping(${governorate})`);
      if (quote.fee !== null) {
        return {
          reply: `مصاريف الشحن لـ ${quote.governorate}: ${formatPrice(quote.fee, quote.currency)}${
            quote.estimatedDays ? `\nمدة التوصيل: حوالي ${quote.estimatedDays} أيام` : ""
          }\nالدفع عند الاستلام متاح ✅`,
          extracted,
        };
      }
      return {
        reply: `لسه محدّدش مصاريف شحن لـ ${governorate} في إعدادات المتجر، هنأكده معاك قبل تأكيد الطلب.`,
        extracted,
      };
    }
    return {
      reply: "شحن لإيه محافظة؟ ابعتلي اسم المحافظة وهحسبلك المصاريف فورًا.",
      extracted,
    };
  }

  if (intent === "stock" && !productQuery) {
    return {
      reply: "قصدك أنهي منتج؟ ابعتلي اسمه بالظبط (أو وصفه) وأقولك السعر والمتاح فورًا.",
      extracted,
    };
  }

  // --- fallback -----------------------------------------------------------
  const needsDetails: string[] = [];
  if (!extracted.name) needsDetails.push("الاسم");
  if (!extracted.phone) needsDetails.push("رقم الهاتف");
  if (extracted.items.length === 0) needsDetails.push("المنتج");

  const hint =
    needsDetails.length > 0 && intent === "buy"
      ? `\nمحتاج منك: ${needsDetails.join("، ")}.`
      : "";

  return {
    reply: `أهلاً بيك في ${params.storeName} 👋\nأقدر أساعدك في: أحسن المنتجات، الأسعار والمتاح من المخزون، مصاريف الشحن لكل محافظة، وتسجيل طلبك من هنا مباشرة.${hint}`,
    extracted,
  };
}

// ---------------------------------------------------------------------------
// Orchestration: session persistence + agent selection
// ---------------------------------------------------------------------------

async function loadOrCreateSession(params: {
  storeId: string;
  platform: SocialPlatform;
  customerRef: string;
  customerName?: string;
}) {
  const existing = await db
    .select()
    .from(aiChatSessions)
    .where(
      and(
        eq(aiChatSessions.storeId, params.storeId),
        eq(aiChatSessions.platform, params.platform),
        eq(aiChatSessions.customerPhoneOrPsid, params.customerRef)
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  try {
    const created = await db
      .insert(aiChatSessions)
      .values({
        storeId: params.storeId,
        platform: params.platform,
        customerPhoneOrPsid: params.customerRef,
        customerName: params.customerName ?? "",
        conversationHistory: [],
        extractedOrderData: { items: [], address: "", phone: "", name: "" },
        status: "ACTIVE",
      })
      .returning();
    return created[0];
  } catch {
    // Concurrent insert won the race — re-read the existing thread.
    const retry = await db
      .select()
      .from(aiChatSessions)
      .where(
        and(
          eq(aiChatSessions.storeId, params.storeId),
          eq(aiChatSessions.platform, params.platform),
          eq(aiChatSessions.customerPhoneOrPsid, params.customerRef)
        )
      )
      .limit(1);
    return retry[0] ?? null;
  }
}

function truncateReply(reply: string): string {
  const text = reply.trim();
  return text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS)}…` : text;
}

/**
 * Runs one conversational turn: loads the customer's thread, executes the AI
 * agent (OpenAI function calling, or the deterministic Arabic agent as a
 * fallback), persists history + extracted order data and returns the reply.
 */
export async function runSocialSalesBot(
  params: SocialBotParams
): Promise<SocialBotResult> {
  const emptyExtracted: ExtractedOrderData = {
    items: [],
    address: "",
    phone: "",
    name: "",
  };

  const storeRows = await db
    .select({ id: stores.id, name: stores.name, currency: stores.currency })
    .from(stores)
    .where(eq(stores.id, params.storeId))
    .limit(1);

  if (storeRows.length === 0) {
    return {
      reply: null,
      source: "skipped",
      status: "ACTIVE",
      sessionId: null,
      orderId: null,
      extracted: emptyExtracted,
      toolCalls: [],
    };
  }

  const store = storeRows[0];
  const session = await loadOrCreateSession({
    storeId: params.storeId,
    platform: params.platform,
    customerRef: params.customerRef,
    customerName: params.customerName,
  });

  if (!session) {
    return {
      reply: null,
      source: "skipped",
      status: "ACTIVE",
      sessionId: null,
      orderId: null,
      extracted: emptyExtracted,
      toolCalls: [],
    };
  }

  const extractedNow = session.extractedOrderData ?? emptyExtracted;

  if (session.status === "HANDED_TO_HUMAN") {
    return {
      reply: null,
      source: "skipped",
      status: "HANDED_TO_HUMAN",
      sessionId: session.id,
      orderId: session.orderId,
      extracted: extractedNow,
      toolCalls: [],
    };
  }

  const history = session.conversationHistory ?? [];

  const ctx: AgentContext = {
    storeId: params.storeId,
    currency: store.currency ?? "EGP",
    origin: params.origin,
    extracted: { ...extractedNow, items: extractedNow.items ?? [] },
    toolCalls: [],
    orderId: null,
    orderTotal: null,
  };

  const openAiReply = await runOpenAiAgent({
    storeName: store.name,
    platform: params.platform,
    currency: ctx.currency,
    personaPrompt: params.personaPrompt,
    history,
    message: params.message,
    ctx,
  });

  let reply: string;
  let source: "openai" | "rule";

  if (openAiReply && openAiReply.length > 0) {
    reply = openAiReply;
    source = "openai";
    // Keep the structured extraction up to date even when the model talks.
    ctx.extracted = cleanExtraction(
      extractCustomerDetails(params.message, ctx.extracted)
    );
  } else {
    const result = await runRuleBasedAgent({
      storeId: params.storeId,
      storeName: store.name,
      currency: ctx.currency,
      message: params.message,
      ctx,
    });
    reply = result.reply;
    source = "rule";
  }

  reply = truncateReply(reply);

  const userEntry: AiChatMessage = {
    role: "user",
    content: params.message,
    at: new Date().toISOString(),
  };
  const assistantEntry: AiChatMessage = {
    role: "assistant",
    content: reply,
    at: new Date().toISOString(),
  };
  const nextHistory: AiChatMessage[] = [...history, userEntry, assistantEntry].slice(-80);

  const status: AiChatSessionStatus = ctx.orderId
    ? "ORDER_CREATED"
    : session.status === "ORDER_CREATED"
      ? "ORDER_CREATED"
      : "ACTIVE";

  await db
    .update(aiChatSessions)
    .set({
      conversationHistory: nextHistory,
      extractedOrderData: ctx.extracted,
      status,
      orderId: ctx.orderId ?? session.orderId,
      customerName: ctx.extracted.name || session.customerName || "",
      updatedAt: new Date(),
    })
    .where(eq(aiChatSessions.id, session.id));

  return {
    reply,
    source,
    status,
    sessionId: session.id,
    orderId: ctx.orderId,
    extracted: ctx.extracted,
    toolCalls: ctx.toolCalls,
  };
}

/** Marks a thread as taken over by the merchant (AI stops replying). */
export async function handOverSession(
  sessionId: string,
  storeId: string
): Promise<boolean> {
  const updated = await db
    .update(aiChatSessions)
    .set({ status: "HANDED_TO_HUMAN", updatedAt: new Date() })
    .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.storeId, storeId)))
    .returning({ id: aiChatSessions.id });
  return updated.length > 0;
}

/** Gives the thread back to the AI assistant. */
export async function resumeAiSession(
  sessionId: string,
  storeId: string
): Promise<boolean> {
  const updated = await db
    .update(aiChatSessions)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.storeId, storeId)))
    .returning({ id: aiChatSessions.id });
  return updated.length > 0;
}

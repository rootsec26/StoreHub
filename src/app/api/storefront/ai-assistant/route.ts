import { NextRequest, NextResponse } from "next/server";
import { eq, sum } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { convertPrice, validateCurrencyCode } from "@/lib/currency";
import { createErrorResponse } from "@/lib/errors";
import {
  getStoreBySlug,
  getStoreCategories,
  getStoreProducts,
} from "@/lib/storefront";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 400;
const MAX_RESULTS = 8;

type ReplyLocale = "ar" | "en";

type SearchMode =
  | "bestsellers"
  | "suggest"
  | "search"
  | "budget"
  | "browse"
  | "greeting";

interface RecommendedProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string;
  categoryName: string | null;
}

interface ParsedQuery {
  locale: ReplyLocale;
  mode: SearchMode;
  maxPrice: number | null;
  minPrice: number | null;
  terms: string[];
}

// ---------------------------------------------------------------------------
// Text normalization (Arabic + English friendly)
// ---------------------------------------------------------------------------

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const DIACRITICS_PATTERN = /[\u064B-\u065F\u0670\u0640]/g;
const LETTER_SPLIT_PATTERN = /[^a-zA-Z\u0600-\u06FF\u0750-\u077F]+/;

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) return String(arabicIndex);
    const extendedIndex = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(char);
    return extendedIndex >= 0 ? String(extendedIndex) : char;
  });
}

function normalizeText(value: string): string {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/٫/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocale(message: string, hint?: string): ReplyLocale {
  if (/[\u0600-\u06FF]/.test(message)) return "ar";
  return hint === "ar" ? "ar" : "en";
}

// ---------------------------------------------------------------------------
// Query understanding: budget, intent and search terms
// ---------------------------------------------------------------------------

const RANGE_PATTERN =
  /(?:من|between|from)\s*(\d+(?:\.\d+)?)\s*(?:الى|to|until|and|&|-)\s*(\d+(?:\.\d+)?)/;
const MAX_PRICE_PATTERN =
  /(اقل|تحت|بحد اقصى|under|below|less than|no more than|up to|max(?:imum)?)\s*(?:من|than|to|:|=)?\s*(\d+(?:\.\d+)?)/;
const MIN_PRICE_PATTERN =
  /(اكثر|فوق|more than|above|over|at least|min(?:imum)?)\s*(?:من|than|from|:|=)?\s*(\d+(?:\.\d+)?)/;
const CURRENCY_AMOUNT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:egp|pounds?|جنيه|جنيها|ج\.?\s?م)/;

const BESTSELLER_PATTERN = /(مبيع|best\s*sell|top\s*sell|popular)/;
const SUGGEST_PATTERN =
  /(اقترح|ترشيح|رشح|نصيحه|recommend|suggest|what should|which one)/;
const LOOSE_PICK_PATTERN = /(^|\s)(افضل|best|top)(\s|$)/;
const BROWSE_PATTERN =
  /(منتج|منتجات|عرض|عروض|اشوف|شوف|وريني|خليني|show|browse|list|everything|كل)/;

const STOPWORDS = new Set([
  // English function words & shopping chatter
  "a", "an", "the", "of", "for", "to", "in", "on", "at", "and", "or", "is",
  "are", "was", "be", "with", "please", "pls", "show", "me", "my", "i",
  "want", "need", "looking", "look", "find", "search", "give", "tell", "what",
  "which", "that", "this", "it", "some", "any", "do", "you", "can", "how",
  "about", "from", "by", "as", "if", "so", "all", "hi", "hello", "hey",
  "thanks", "thank",
  // Generic product words
  "منتج", "منتجات", "منتجه", "things", "thing", "stuff", "item", "items",
  "product", "products",
  // Arabic particles & intents
  "من", "في", "على", "عن", "الى", "و", "او", "انا", "عايز", "ابغى", "ابغاء",
  "محتاج", "محتاجه", "حاجه", "احب", "اريد", "ابي", "لي", "هذا", "هذه",
  "ذلك", "الذي", "التي", "اللي", "ايه", "كل", "بعد", "قبل", "عند", "مثل",
  "جدا", "هو", "هي", "وش", "ازاي", "فين", "كم", "هل", "لو", "سمحت",
  "شكرا", "ممكن", "اشوف", "شوف", "وريني", "خليني", "خلي", "اعرض", "عرض",
  // Budget / ranking vocabulary (handled before tokenising)
  "اقل", "اكثر", "تحت", "فوق", "under", "below", "above", "over", "less",
  "than", "more", "least", "between", "until", "up", "max", "min",
  "maximum", "minimum", "at", "budget", "cheap", "cheapest", "affordable",
  "expensive", "recommend", "suggest", "suggestion", "best", "top", "popular",
  "good", "nice", "pick", "picks", "seller", "sellers", "selling",
  // Arabic intent verbs & superlatives
  "اقترح", "ترشيح", "رشح", "ارشح", "نصيحه", "افضل", "مبيع", "مبيعات",
  "مبيعا", "بيع",
  // Currency words
  "egp", "pound", "pounds", "جنيه", "جنيها",
]);

function stemToken(token: string): string | null {
  let word = token;

  if (word.length > 4 && (word.startsWith("و") || word.startsWith("ب"))) {
    word = word.slice(1);
  }
  if (word.length > 4 && word.startsWith("ال")) {
    word = word.slice(2);
  }

  const arabic = /[\u0600-\u06FF]/.test(word);
  if (arabic) {
    const suffixes = ["ات", "ون", "ين", "ان", "ها", "هم", "كم", "ية", "ه"];
    for (const suffix of suffixes) {
      if (
        word.length - suffix.length >= 3 &&
        word.length > suffix.length &&
        word.endsWith(suffix)
      ) {
        word = word.slice(0, -suffix.length);
        break;
      }
    }
  } else {
    if (word.length > 4 && word.endsWith("es")) word = word.slice(0, -2);
    else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
      word = word.slice(0, -1);
    }
  }

  return word.length >= 2 ? word : null;
}

function extractTerms(normalized: string): string[] {
  const rawTokens = normalized.split(LETTER_SPLIT_PATTERN).filter(Boolean);
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawTokens) {
    const token = raw.toLowerCase();
    if (token.length < 2 || STOPWORDS.has(token)) continue;

    const stemmed = stemToken(token);
    if (!stemmed || stemmed.length < 2 || STOPWORDS.has(stemmed)) continue;
    if (seen.has(stemmed)) continue;

    seen.add(stemmed);
    terms.push(stemmed);
    if (terms.length >= 6) break;
  }

  return terms;
}

function toStoreCurrency(
  amount: number,
  fromCurrency: string | undefined,
  toCurrency: string
): number {
  if (!fromCurrency || fromCurrency === toCurrency) return amount;
  if (!validateCurrencyCode(fromCurrency)) return amount;
  if (!validateCurrencyCode(toCurrency)) return amount;
  return convertPrice(amount, fromCurrency, toCurrency);
}

function parseQuery(
  rawMessage: string,
  localeHint: string | undefined,
  currencyHint: string | undefined,
  storeCurrency: string
): ParsedQuery {
  const locale = detectLocale(rawMessage, localeHint);
  const normalized = normalizeText(rawMessage);

  let maxPrice: number | null = null;
  let minPrice: number | null = null;

  const range = normalized.match(RANGE_PATTERN);
  const max = normalized.match(MAX_PRICE_PATTERN);
  const min = normalized.match(MIN_PRICE_PATTERN);
  const budget = normalized.match(CURRENCY_AMOUNT_PATTERN);

  // When the message names a currency explicitly (e.g. "600 جنيه" / "500 EGP")
  // the number is already in EGP, otherwise treat it as the visitor's selected
  // display currency. Either way the budget ends up in the store's base currency.
  const mentionedCurrency = budget ? "EGP" : undefined;
  const convert = (value: number): number =>
    toStoreCurrency(value, mentionedCurrency ?? currencyHint, storeCurrency);

  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
      minPrice = convert(low);
      maxPrice = convert(high);
    }
  } else if (max) {
    const value = Number(max[2]);
    if (Number.isFinite(value)) {
      maxPrice = convert(value);
    }
  } else if (min) {
    const value = Number(min[2]);
    if (Number.isFinite(value)) {
      minPrice = convert(value);
    }
  } else if (budget) {
    const value = Number(budget[1]);
    if (Number.isFinite(value)) {
      maxPrice = convert(value);
    }
  }

  const terms = extractTerms(normalized);
  const wantsBestSellers = BESTSELLER_PATTERN.test(normalized);
  const wantsSuggestion =
    SUGGEST_PATTERN.test(normalized) || LOOSE_PICK_PATTERN.test(normalized);
  const wantsBrowse = BROWSE_PATTERN.test(normalized);
  const hasBudget = maxPrice !== null || minPrice !== null;

  let mode: SearchMode;
  if (wantsBestSellers) mode = "bestsellers";
  else if (wantsSuggestion) mode = "suggest";
  else if (terms.length > 0) mode = "search";
  else if (hasBudget) mode = "budget";
  else if (wantsBrowse) mode = "browse";
  else mode = "greeting";

  return { locale, mode, maxPrice, minPrice, terms };
}

// ---------------------------------------------------------------------------
// Sales lookup (best sellers / suggestions)
// ---------------------------------------------------------------------------

async function fetchUnitsSold(storeId: string): Promise<Map<string, number>> {
  const sold = new Map<string, number>();

  try {
    const rows = await db
      .select({
        productId: orderItems.productId,
        quantity: sum(orderItems.quantity),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(eq(orders.storeId, storeId))
      .groupBy(orderItems.productId);

    for (const row of rows) {
      const quantity = Number(row.quantity ?? 0);
      if (Number.isFinite(quantity) && quantity > 0) {
        sold.set(row.productId, quantity);
      }
    }
  } catch (error) {
    console.warn("AI assistant: sales lookup failed:", error);
  }

  return sold;
}

// ---------------------------------------------------------------------------
// Reply text
// ---------------------------------------------------------------------------

interface ReplyInput {
  locale: ReplyLocale;
  mode: SearchMode;
  storeName: string;
  currency: string;
  total: number;
  returned: number;
  maxPrice: number | null;
  minPrice: number | null;
  terms: string[];
}

function arProductCount(count: number): string {
  if (count === 1) return "منتج واحد";
  if (count === 2) return "منتجان";
  if (count >= 3 && count <= 10) return `${count} منتجات`;
  return `${count} منتجًا`;
}

function budgetLabel(
  locale: ReplyLocale,
  maxPrice: number | null,
  minPrice: number | null,
  currency: string
): string {
  if (maxPrice !== null && minPrice !== null) {
    return locale === "ar"
      ? `بين ${minPrice} و ${maxPrice} ${currency}`
      : `between ${minPrice} and ${maxPrice} ${currency}`;
  }
  if (maxPrice !== null) {
    return locale === "ar"
      ? `بسعر أقل من ${maxPrice} ${currency}`
      : `under ${maxPrice} ${currency}`;
  }
  if (minPrice !== null) {
    return locale === "ar"
      ? `بسعر أكثر من ${minPrice} ${currency}`
      : `over ${minPrice} ${currency}`;
  }
  return "";
}

function buildReply(input: ReplyInput): string {
  const { locale, mode, storeName, currency, total, returned, terms } = input;
  const budget = budgetLabel(locale, input.maxPrice, input.minPrice, currency);
  const termsLabel =
    terms.length > 0
      ? locale === "ar"
        ? `«${terms.join(" ")}»`
        : `"${terms.join(" ")}"`
      : "";
  const budgetPart = budget ? ` ${budget}` : "";
  const termsPart = termsLabel ? ` ${termsLabel}` : "";

  if (locale === "ar") {
    if (mode === "greeting") {
      return `مرحبًا بك في ${storeName}! اسألني عن أي منتج، أو أخبرني بميزانيتك مثل "أقل من 600 جنيه"، أو اطلب مني ترشيحًا.`;
    }
    if (total === 0) {
      if (input.maxPrice !== null || input.minPrice !== null) {
        return `لا توجد منتجات${budgetPart} في ${storeName}. جرّب ميزانية أخرى أو اطلب ترشيحًا عامًا.`;
      }
      if (termsLabel) {
        return `لم أجد منتجات تطابق${termsPart} في ${storeName}. جرّب كلمات أخرى مثل اسم المنتج أو اسم القسم.`;
      }
      return `لا توجد منتجات متاحة حاليًا في ${storeName}.`;
    }

    let lead: string;
    if (mode === "bestsellers") {
      lead = `المنتجات الأكثر مبيعاً في ${storeName}${budgetPart}`;
    } else if (mode === "suggest") {
      lead = `بناءً على طلبك، هذه أفضل اختياراتي من ${storeName}${budgetPart}`;
    } else if (mode === "browse") {
      lead = `تفضل مجموعة من منتجات ${storeName}`;
    } else {
      lead = `وجدت ${arProductCount(total)} في ${storeName}${termsPart}${budgetPart}`;
    }

    const shown =
      total > returned ? ` (أفضل ${returned} من أصل ${total})` : "";
    return `${lead}${shown}:`;
  }

  if (mode === "greeting") {
    return `Hi! I'm the shopping assistant for ${storeName}. Ask me about any product, tell me your budget (for example "under 600 EGP"), or ask me to pick something for you.`;
  }
  if (total === 0) {
    if (input.maxPrice !== null || input.minPrice !== null) {
      return `I couldn't find any products${budgetPart} at ${storeName}. Try a different budget or ask me for a general pick.`;
    }
    if (termsLabel) {
      return `I couldn't find products matching${termsPart} at ${storeName}. Try other words, like a product or category name.`;
    }
    return `There are no products available at ${storeName} right now.`;
  }

  let lead: string;
  if (mode === "bestsellers") {
    lead = `Here are the best sellers at ${storeName}${budgetPart}`;
  } else if (mode === "suggest") {
    lead = `Based on what you're after, my picks from ${storeName}${budgetPart}`;
  } else if (mode === "browse") {
    lead = `Here are some products from ${storeName}`;
  } else {
    lead = `Found ${total} product${total === 1 ? "" : "s"} at ${storeName}${termsPart}${budgetPart}`;
  }

  const shown = total > returned ? ` (showing top ${returned} of ${total})` : "";
  return `${lead}${shown}:`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      storeSlug?: unknown;
      message?: unknown;
      locale?: unknown;
      currency?: unknown;
    } | null;

    const storeSlug =
      typeof body?.storeSlug === "string" ? body.storeSlug.trim() : "";
    const rawMessage =
      typeof body?.message === "string" ? body.message.trim() : "";
    const localeHint =
      body?.locale === "ar" || body?.locale === "en" ? body.locale : undefined;
    const currencyHint =
      typeof body?.currency === "string" ? body.currency.trim() : undefined;

    if (!storeSlug) {
      return NextResponse.json(
        { error: "storeSlug is required", code: "STORE_SLUG_REQUIRED" },
        { status: 400 }
      );
    }
    if (!rawMessage) {
      return NextResponse.json(
        { error: "message is required", code: "MESSAGE_REQUIRED" },
        { status: 400 }
      );
    }

    const message = rawMessage.slice(0, MAX_MESSAGE_LENGTH);

    const store = await getStoreBySlug(storeSlug);
    if (!store) {
      return NextResponse.json(
        { error: "Store not found", code: "STORE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const [productRows, categoryRows] = await Promise.all([
      getStoreProducts(store.id),
      getStoreCategories(store.id),
    ]);

    const storeName = store.name;
    const currency = (store.currency ?? "EGP").toUpperCase();

    if (productRows.length === 0) {
      return NextResponse.json({
        replyText:
          localeHint === "ar"
            ? `متجر ${storeName} لا يحتوي على منتجات حاليًا.`
            : `${storeName} doesn't have any products listed right now.`,
        recommendedProducts: [] as RecommendedProduct[],
      });
    }

    const parsed = parseQuery(message, localeHint, currencyHint, currency);

    if (parsed.mode === "greeting") {
      return NextResponse.json({
        replyText: buildReply({
          locale: parsed.locale,
          mode: parsed.mode,
          storeName,
          currency,
          total: 0,
          returned: 0,
          maxPrice: parsed.maxPrice,
          minPrice: parsed.minPrice,
          terms: parsed.terms,
        }),
        recommendedProducts: [] as RecommendedProduct[],
      });
    }

    const needsSales =
      parsed.mode === "bestsellers" || parsed.mode === "suggest";
    const unitsSold = needsSales
      ? await fetchUnitsSold(store.id)
      : new Map<string, number>();

    const categoryNameById = new Map(
      categoryRows.map((category) => [category.id, category.name])
    );
    const hasBudget = parsed.maxPrice !== null || parsed.minPrice !== null;

    const prepared = productRows.map((row, index) => {
      const categoryName =
        (row.categoryId ? categoryNameById.get(row.categoryId) : null) ?? null;
      const price = Number(row.price);
      return {
        row,
        index,
        categoryName,
        price: Number.isFinite(price) ? price : 0,
        nameText: normalizeText(row.name),
        descriptionText: normalizeText(row.description ?? ""),
        categoryText: categoryName ? normalizeText(categoryName) : "",
        inStock: row.stock > 0,
        sold: unitsSold.get(row.id) ?? 0,
      };
    });

    let candidates = prepared.filter((candidate) => {
      if (hasBudget) {
        if (
          parsed.maxPrice !== null &&
          candidate.price > parsed.maxPrice + 0.001
        ) {
          return false;
        }
        if (
          parsed.minPrice !== null &&
          candidate.price < parsed.minPrice - 0.001
        ) {
          return false;
        }
      }
      return true;
    });

    if (parsed.mode === "search") {
      // Only a concrete search narrows the catalog down. Intent-based modes
      // (best sellers, suggestions, budget) keep stray words out of the
      // filter and merely use them to boost the ranking.
      candidates = candidates.filter((candidate) =>
        parsed.terms.some(
          (term) =>
            candidate.nameText.includes(term) ||
            candidate.categoryText.includes(term) ||
            candidate.descriptionText.includes(term)
        )
      );
    }

    const scored = candidates.map((candidate) => {
      let score = 0;

      for (const term of parsed.terms) {
        if (candidate.nameText.includes(term)) score += 4;
        else if (candidate.categoryText.includes(term)) score += 3;
        else if (candidate.descriptionText.includes(term)) score += 1;
      }

      score += candidate.inStock ? 2 : -4;
      score += candidate.sold * 5;

      if (parsed.mode === "budget") {
        score = candidate.inStock ? 100 : 0;
      } else if (parsed.mode === "browse" || parsed.mode === "suggest") {
        score += candidate.inStock ? 10 : 0;
      }

      return { ...candidate, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      if (a.price !== b.price) return a.price - b.price;
      return a.index - b.index;
    });

    const total = scored.length;
    const top = scored.slice(0, MAX_RESULTS);

    const recommendedProducts: RecommendedProduct[] = top.map((candidate) => ({
      id: candidate.row.id,
      name: candidate.row.name,
      description: truncate(candidate.row.description ?? "", 220),
      price: candidate.row.price,
      stock: candidate.row.stock,
      imageUrl: candidate.row.imageUrl ?? "",
      categoryName: candidate.categoryName,
    }));

    return NextResponse.json({
      replyText: buildReply({
        locale: parsed.locale,
        mode: parsed.mode,
        storeName,
        currency,
        total,
        returned: recommendedProducts.length,
        maxPrice: parsed.maxPrice,
        minPrice: parsed.minPrice,
        terms: parsed.terms,
      }),
      recommendedProducts,
    });
  } catch (error) {
    console.error("Storefront AI assistant error:", error);
    return createErrorResponse(error, "Failed to generate recommendations");
  }
}

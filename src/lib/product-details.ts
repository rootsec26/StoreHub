export const PRODUCT_AVAILABILITIES = [
  "IN_STOCK",
  "OUT_OF_STOCK",
  "COMING_SOON",
] as const;

export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface ProductPricingInput {
  price: string | number | null | undefined;
  salePrice?: string | number | null;
}

export function toAvailability(value: unknown): ProductAvailability {
  return PRODUCT_AVAILABILITIES.includes(value as ProductAvailability)
    ? (value as ProductAvailability)
    : "IN_STOCK";
}

export function toNullablePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Drizzle `numeric` columns are typed as strings on insert/update. */
export function toNullableNumeric(value: unknown): string | null {
  const parsed = toNullablePrice(value);
  return parsed === null ? null : parsed.toFixed(2);
}

export function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function toStringArray(value: unknown, maxItems = 24, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function toSpecifications(value: unknown): ProductSpecification[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim().slice(0, 240);
        return text ? { label: "", value: text } : null;
      }
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = String(record.label ?? record.name ?? "").trim().slice(0, 120);
      const specValue = String(record.value ?? record.detail ?? "").trim().slice(0, 240);
      if (!label && !specValue) return null;
      return { label, value: specValue || label };
    })
    .filter((item): item is ProductSpecification => item !== null)
    .slice(0, 40);
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Customer-facing price: sale price wins when it is lower than the base price. */
export function effectiveProductPrice(product: ProductPricingInput): number {
  const base = toNumber(product.price);
  const sale = toNumber(product.salePrice);
  return sale > 0 ? Math.min(base, sale) : base;
}

/** Original/reference price shown with a strikethrough when discounted. */
export function comparePriceFor(product: {
  price: string | number | null | undefined;
  salePrice?: string | number | null;
  compareAtPrice?: string | number | null;
}): number | null {
  const current = effectiveProductPrice(product);
  const compare = toNumber(product.compareAtPrice);
  if (compare > current) return compare;
  const base = toNumber(product.price);
  return base > current ? base : null;
}

export function productDiscountPercent(product: {
  price: string | number | null | undefined;
  salePrice?: string | number | null;
  compareAtPrice?: string | number | null;
  discountPercent?: number | null;
}): number | null {
  // The badge is derived ONLY from real prices: a strikethrough reference
  // price that is strictly greater than the current price. The stored
  // discount_percent field is ignored — it can be stale or set without a
  // compare price, which produced fake "خصم X%" badges.
  const compare = comparePriceFor(product);
  const current = effectiveProductPrice(product);
  if (compare == null || compare <= 0 || current <= 0 || current >= compare) {
    return null;
  }
  return Math.round(((compare - current) / compare) * 100);
}

export function productImageUrls(product: {
  imageUrl?: string | null;
  imageGallery?: string[] | null;
}): string[] {
  const gallery = Array.isArray(product.imageGallery) ? product.imageGallery : [];
  return [product.imageUrl ?? "", ...gallery]
    .map((url) => String(url ?? "").trim())
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, 12);
}

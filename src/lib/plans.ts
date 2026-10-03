export type Plan = "free" | "pro";

export const PLANS: Record<Plan, { productLimit: number | null; price: string }> = {
  free: { productLimit: 15, price: "0" },
  pro: { productLimit: null, price: "299" },
};

export function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "pro";
}

export function normalizePlan(value: unknown): Plan {
  return isPlan(value) ? value : "free";
}

/** Returns the max number of products allowed, or `null` for unlimited. */
export function productLimitFor(plan: Plan): number | null {
  return PLANS[plan].productLimit;
}

export function canCreateProduct(plan: Plan, currentCount: number): boolean {
  const limit = productLimitFor(plan);
  return limit === null || currentCount < limit;
}

/**
 * Strict paid-plan window check: a `pro` store is only entitled while
 * `plan_expires_at` is in the future. The free plan never expires.
 * A paid plan without a stored expiry is treated as expired (strict).
 */
export function isPlanActive(
  plan: Plan,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (plan !== "pro") return true;
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts > now.getTime();
}

/** Plan that should be *enforced* today (expired `pro` falls back to `free`). */
export function effectivePlan(
  plan: Plan,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): Plan {
  return isPlanActive(plan, expiresAt, now) ? plan : "free";
}

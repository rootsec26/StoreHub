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

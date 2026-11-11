import { redirect } from "next/navigation";

import SelectProductClient from "@/components/products/SelectProductClient";
import { getSessionWithStore } from "@/lib/auth";
import { getActiveProductKeys, getSafeInternalPath } from "@/lib/products";
import { getUserProductState } from "@/lib/products-server";

export const dynamic = "force-dynamic";

/**
 * Aura Hub — unified post-auth product routing.
 *
 * - No session            → /sign-in?next=/select-product
 * - No active products    → product selection grid (first-time experience)
 * - Exactly one product   → straight to that product's entry route
 * - Multiple products     → Product Switcher with "continue" highlight
 *
 * A safe `?next=` return URL is honoured once product onboarding is
 * complete (see /api/hub for the same rule on explicit selection).
 */
export default async function SelectProductPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; stay?: string }>;
}) {
  const session = await getSessionWithStore();
  if (!session) {
    redirect("/sign-in?next=/select-product");
  }

  const { next: rawNext, stay } = await searchParams;
  const next = getSafeInternalPath(rawNext);
  // `?stay=1` opens the full hub even for single-product users — used by the
  // dashboard product switcher. It never redirects, so it cannot loop.
  const forceHub = stay === "1";

  const { products, lastUsedProduct, hasStore } =
    await getUserProductState(session.id);
  const activeKeys = getActiveProductKeys(products);

  if (activeKeys.length === 1 && !forceHub) {
    const key = activeKeys[0];
    // Route through /api/hub/enter: it refreshes lastUsedProduct, re-mints
    // the session cookie with healed store claims (stale JWTs would
    // otherwise loop between /dashboard and /select-product), then lands
    // on the product's entry route — honouring `next` once setup is done.
    const params = new URLSearchParams({ product: key });
    if (next) params.set("next", next);
    redirect(`/api/hub/enter?${params.toString()}`);
  }

  return (
    <SelectProductClient
      products={products}
      lastUsedProduct={lastUsedProduct}
      next={next}
      hasStore={hasStore}
    />
  );
}

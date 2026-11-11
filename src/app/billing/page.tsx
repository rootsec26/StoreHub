import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

/**
 * Merchant subscription billing (Aura StoreHub monthly plan, manual
 * Vodafone Cash). Reachable for expired subscribers — the proxy only
 * requires a session, never an active plan.
 */
export default async function BillingPage() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in?next=/billing");
  }
  return <BillingClient />;
}

import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { stores } from "@/db/schema";
import { getSession } from "@/lib/auth";

/**
 * True when the current request belongs to the owner (or an authenticated
 * staff member) of the given store.
 *
 * Customer-facing order actions accept either a signed order token or this
 * session-based proof. The session claim is signed by the app, so trusting
 * `session.storeId` is safe, but we still verify the owner row for owners who
 * signed in before the store existed.
 */
export async function isAuthenticatedStoreOwner(
  storeId: string
): Promise<boolean> {
  if (!storeId) return false;

  const session = await getSession();
  if (!session?.id) return false;

  if (session.storeId === storeId) return true;

  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.ownerId, session.id)))
    .limit(1);

  return rows.length > 0;
}

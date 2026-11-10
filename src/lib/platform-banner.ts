import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import { platformBroadcasts } from "@/db/schema";

import type { PlatformBroadcastDTO } from "./platform-banner-types";

export {
  MAX_BANNER_DURATION_HOURS,
  MAX_BANNER_MESSAGE_LENGTH,
} from "./platform-banner-types";
export type { PlatformBroadcastDTO } from "./platform-banner-types";

function toDTO(row: typeof platformBroadcasts.$inferSelect): PlatformBroadcastDTO {
  return {
    id: row.id,
    message: row.message,
    expiresAt: row.expiresAt.toISOString(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The single live banner, or null when nothing is active and unexpired. */
export async function getActivePlatformBroadcast(): Promise<PlatformBroadcastDTO | null> {
  const rows = await db
    .select()
    .from(platformBroadcasts)
    .where(
      and(
        eq(platformBroadcasts.isActive, true),
        gt(platformBroadcasts.expiresAt, new Date())
      )
    )
    .orderBy(desc(platformBroadcasts.createdAt))
    .limit(1);

  const row = rows[0];
  return row ? toDTO(row) : null;
}

/** Most recent broadcasts for the admin panel (any state). */
export async function listPlatformBroadcasts(limit = 20): Promise<PlatformBroadcastDTO[]> {
  const rows = await db
    .select()
    .from(platformBroadcasts)
    .orderBy(desc(platformBroadcasts.createdAt))
    .limit(limit);

  return rows.map(toDTO);
}

export async function createPlatformBroadcast(input: {
  message: string;
  expiresInHours: number;
}): Promise<PlatformBroadcastDTO> {
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

  const [row] = await db
    .insert(platformBroadcasts)
    .values({ message: input.message, expiresAt })
    .returning();

  if (!row) throw new Error("Failed to create platform broadcast");
  return toDTO(row);
}

export async function setPlatformBroadcastActive(
  id: string,
  isActive: boolean
): Promise<PlatformBroadcastDTO | null> {
  const [row] = await db
    .update(platformBroadcasts)
    .set({ isActive })
    .where(eq(platformBroadcasts.id, id))
    .returning();

  return row ? toDTO(row) : null;
}

export async function deletePlatformBroadcast(id: string): Promise<boolean> {
  const result = await db
    .delete(platformBroadcasts)
    .where(eq(platformBroadcasts.id, id));

  // node-postgres reports affected rows on `rowCount`.
  return (result.rowCount ?? 0) > 0;
}

/** Housekeeping: mark long-expired rows inactive so the table stays tidy. */
export async function expireStalePlatformBroadcasts(): Promise<void> {
  await db
    .update(platformBroadcasts)
    .set({ isActive: false })
    .where(
      and(
        eq(platformBroadcasts.isActive, true),
        sql`${platformBroadcasts.expiresAt} <= now()`
      )
    );
}

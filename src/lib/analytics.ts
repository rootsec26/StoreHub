import "server-only";

import { db } from "@/db";
import { analyticsEvents, type AnalyticsEventType } from "@/db/schema";
import { formatErrorForLog } from "@/lib/errors";

const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function normalizeAnalyticsVisitorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const visitorId = value.trim();
  return VISITOR_ID_PATTERN.test(visitorId) ? visitorId : null;
}

function sanitizeAnalyticsPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const path = value.split(/[?#]/, 1)[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  return path.slice(0, 300);
}

/**
 * Fire-and-forget-safe analytics writer. Analytics must never break signup,
 * checkout or page rendering, so every failure (including a missing
 * `analytics_events` table before migration 0024 is applied) is swallowed.
 */
export async function recordAnalyticsEvent(input: {
  eventType: AnalyticsEventType;
  visitorId: unknown;
  userId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const visitorId = normalizeAnalyticsVisitorId(input.visitorId);
  if (!visitorId) return;

  try {
    await db.insert(analyticsEvents).values({
      eventType: input.eventType,
      visitorId,
      userId: input.userId ?? null,
      storeId: input.storeId ?? null,
      orderId: input.orderId ?? null,
      path: sanitizeAnalyticsPath(input.path),
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.warn(
      "[analytics] failed to record event:",
      formatErrorForLog(error, { includeStack: false })
    );
  }
}

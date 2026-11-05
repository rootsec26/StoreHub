/**
 * Shared limits and defaults for the notification system.
 * Keep these in sync with the validation schemas and UI counters.
 */
export const MAX_TITLE_LENGTH = 120;
export const MAX_BODY_LENGTH = 2000;

/** Recipients dispatched per HTTP batch. Small enough for serverless limits. */
export const SEND_BATCH_SIZE = 25;
/** Concurrent provider calls inside one batch. */
export const SEND_CONCURRENCY = 5;

export const NOTIFICATION_PAGE_SIZE = 25;
export const RECIPIENT_PAGE_SIZE = 25;
export const RECENT_USERS_DAYS = 7;

/** One WhatsApp message consumes one credit (see src/lib/paywall.ts). */
export const WHATSAPP_CREDIT_COST = 1;

/** A SENDING campaign can be reclaimed after this many minutes. */
export const STALE_SENDING_MINUTES = 5;

export const MERCHANT_CAMPAIGN_CHANNEL = "WHATSAPP" as const;
export const ADMIN_BROADCAST_CHANNEL = "IN_APP" as const;

export const MERCHANT_SCOPE = "MERCHANT_TO_CUSTOMER" as const;
export const ADMIN_SCOPE = "ADMIN_TO_MERCHANT" as const;

import { z } from "zod";

import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
} from "@/db/schema";

import { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from "./constants";

const optionalDateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .optional()
  .nullable();

export const audienceFilterSchema = z.object({
  customerIds: z.array(z.string().uuid()).max(2000).optional(),
  merchantIds: z.array(z.string().uuid()).max(10000).optional(),
  minSpend: z.number().min(0).max(1_000_000_000).optional(),
  vipTierId: z.string().uuid().optional(),
  lastOrderDays: z.number().int().min(1).max(3650).optional(),
  loyaltyPoints: z.number().int().min(0).max(100_000_000).optional(),
  plan: z.enum(["free", "pro"]).optional(),
});

export const merchantAudienceTypes = [
  "ALL_CUSTOMERS",
  "SELECTED_CUSTOMERS",
  "CUSTOMER_SEGMENT",
] as const;

export const adminAudienceTypes = [
  "ALL_MERCHANTS",
  "SELECTED_MERCHANTS",
  "MERCHANT_PLAN",
] as const;

export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(MAX_TITLE_LENGTH),
    body: z.string().trim().min(1, "Message is required").max(MAX_BODY_LENGTH),
    category: z.enum(NOTIFICATION_CATEGORIES).default("GENERAL"),
    priority: z.enum(NOTIFICATION_PRIORITIES).default("NORMAL"),
    audienceType: z.enum(merchantAudienceTypes),
    audienceFilter: audienceFilterSchema.default({}),
    sendNow: z.boolean().default(false),
    scheduledAt: optionalDateString,
  })
  .superRefine((value, ctx) => {
    if (
      value.audienceType === "SELECTED_CUSTOMERS" &&
      (!value.audienceFilter.customerIds ||
        value.audienceFilter.customerIds.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["audienceFilter", "customerIds"],
        message: "Select at least one customer",
      });
    }

    if (value.audienceType === "CUSTOMER_SEGMENT") {
      const filter = value.audienceFilter;
      const hasSegment =
        filter.minSpend !== undefined ||
        filter.vipTierId !== undefined ||
        filter.lastOrderDays !== undefined ||
        filter.loyaltyPoints !== undefined;
      if (!hasSegment) {
        ctx.addIssue({
          code: "custom",
          path: ["audienceFilter"],
          message: "Choose at least one segment filter",
        });
      }
    }
  });

export const createBroadcastSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(MAX_TITLE_LENGTH),
    body: z.string().trim().min(1, "Message is required").max(MAX_BODY_LENGTH),
    category: z.enum(NOTIFICATION_CATEGORIES).default("ANNOUNCEMENT"),
    priority: z.enum(NOTIFICATION_PRIORITIES).default("NORMAL"),
    audienceType: z.enum(adminAudienceTypes),
    audienceFilter: audienceFilterSchema.default({}),
    expiresAt: optionalDateString,
  })
  .superRefine((value, ctx) => {
    if (
      value.audienceType === "SELECTED_MERCHANTS" &&
      (!value.audienceFilter.merchantIds ||
        value.audienceFilter.merchantIds.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["audienceFilter", "merchantIds"],
        message: "Select at least one merchant",
      });
    }

    if (
      value.audienceType === "MERCHANT_PLAN" &&
      !value.audienceFilter.plan
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["audienceFilter", "plan"],
        message: "Choose a plan",
      });
    }
  });

export const campaignActionSchema = z.object({
  action: z.enum(["send", "cancel", "retry"]),
});

export const inboxReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(500).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, {
    message: "Provide ids or all=true",
    path: ["ids"],
  });

export const audienceQuerySchema = z.object({
  audienceType: z.enum(NOTIFICATION_AUDIENCE_TYPES),
  customerIds: z.string().optional(),
  merchantIds: z.string().optional(),
  minSpend: z.coerce.number().min(0).optional(),
  vipTierId: z.string().uuid().optional(),
  lastOrderDays: z.coerce.number().int().min(1).max(3650).optional(),
  loyaltyPoints: z.coerce.number().int().min(0).optional(),
  plan: z.enum(["free", "pro"]).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  storeId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminUsersQuerySchema = z.object({
  tab: z.enum(["all", "recent"]).default("all"),
  days: z.coerce.number().int().min(1).max(90).default(7),
  q: z.string().trim().max(120).optional(),
  plan: z.enum(["free", "pro"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function parseCsvIds(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

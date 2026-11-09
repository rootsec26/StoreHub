import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  NOTIFICATION_STATUSES,
  customers,
  notificationEvents,
  notificationRecipients,
  notifications,
  products,
  stores,
  users,
  type NotificationAudienceFilter,
  type NotificationAudienceType,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationScope,
  type NotificationStatus,
  type RecipientStatus,
} from "@/db/schema";

import {
  resolveCustomerAudience,
  resolveMerchantAudience,
  getWhatsAppCreditBalance,
  type AudienceRecipient,
} from "./audience";
import {
  ADMIN_BROADCAST_CHANNEL,
  ADMIN_SCOPE,
  MERCHANT_CAMPAIGN_CHANNEL,
  MERCHANT_SCOPE,
  RECENT_USERS_DAYS,
  SEND_BATCH_SIZE,
  SEND_CONCURRENCY,
  STALE_SENDING_MINUTES,
} from "./constants";
import { deliverWhatsAppMessage } from "./channels";
import { maskPhone } from "./mask";
import type {
  AdminCampaignDTO,
  AdminOverviewStats,
  AdminUserCounts,
  AdminUserRow,
  AdminUsersResponse,
  AudiencePreview,
  CampaignListResponse,
  CampaignSummaryStats,
  InboxItem,
  InboxResponse,
  NotificationDTO,
  NotificationSummary,
  RecipientDTO,
  SendBatchResult,
} from "./types";

export class MessagingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MessagingError";
    this.code = code;
    this.status = status;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
}

function isNotificationStatus(value: string): value is NotificationStatus {
  return (NOTIFICATION_STATUSES as readonly string[]).includes(value);
}

function toNotificationDTO(
  row: typeof notifications.$inferSelect
): NotificationDTO {
  return {
    id: row.id,
    scope: row.scope as NotificationScope,
    storeId: row.storeId,
    senderType: row.senderType as "MERCHANT" | "ADMIN",
    createdByUserId: row.createdByUserId,
    title: row.title,
    body: row.body,
    category: row.category as NotificationCategory,
    priority: row.priority as NotificationPriority,
    channel: row.channel as NotificationChannel,
    status: row.status as NotificationStatus,
    audienceType: row.audienceType as NotificationAudienceType,
    audienceFilter: row.audienceFilter ?? {},
    scheduledAt: iso(row.scheduledAt),
    expiresAt: iso(row.expiresAt),
    sentAt: iso(row.sentAt),
    recipientCount: row.recipientCount,
    deliveredCount: row.deliveredCount,
    failedCount: row.failedCount,
    readCount: row.readCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecipientDTO(
  row: typeof notificationRecipients.$inferSelect
): RecipientDTO {
  return {
    id: row.id,
    notificationId: row.notificationId,
    recipientType: row.recipientType as "CUSTOMER" | "MERCHANT",
    customerId: row.customerId,
    userId: row.userId,
    name: row.recipientName,
    phone: row.recipientPhone,
    email: row.recipientEmail,
    channel: row.channel as NotificationChannel,
    status: row.status as RecipientStatus,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    sentAt: iso(row.sentAt),
    deliveredAt: iso(row.deliveredAt),
    readAt: iso(row.readAt),
    createdAt: row.createdAt.toISOString(),
  };
}

async function insertRecipientRows(
  tx: Tx,
  notificationId: string,
  recipients: AudienceRecipient[],
  channel: NotificationChannel,
  status: RecipientStatus,
  sentAt: Date | null
): Promise<void> {
  const rows = recipients.map((recipient) => ({
    notificationId,
    recipientKey: recipient.key,
    recipientType: recipient.recipientType,
    customerId: recipient.customerId,
    userId: recipient.userId,
    storeId: recipient.storeId,
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    channel,
    status,
    sentAt,
    deliveredAt: status === "SENT" ? sentAt : null,
  }));

  for (const part of chunk(rows, 500)) {
    await tx.insert(notificationRecipients).values(part);
  }
}

export async function createMerchantCampaign(input: {
  storeId: string;
  userId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  audienceType: NotificationAudienceType;
  audienceFilter: NotificationAudienceFilter;
  scheduledAt?: string | null;
  ipAddress?: string | null;
}): Promise<NotificationDTO> {
  const recipients = await resolveCustomerAudience(
    input.storeId,
    input.audienceType,
    input.audienceFilter
  );

  if (recipients.length === 0) {
    throw new MessagingError(
      "NO_RECIPIENTS",
      "No customers match the selected audience.",
      400
    );
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const status: NotificationStatus = scheduledAt ? "SCHEDULED" : "DRAFT";

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(notifications)
      .values({
        scope: MERCHANT_SCOPE,
        storeId: input.storeId,
        senderType: "MERCHANT",
        createdByUserId: input.userId,
        title: input.title,
        body: input.body,
        category: input.category,
        priority: input.priority,
        channel: MERCHANT_CAMPAIGN_CHANNEL,
        status,
        audienceType: input.audienceType,
        audienceFilter: input.audienceFilter,
        scheduledAt,
        recipientCount: recipients.length,
      })
      .returning();

    await insertRecipientRows(
      tx,
      created.id,
      recipients,
      MERCHANT_CAMPAIGN_CHANNEL,
      "PENDING",
      null
    );

    await tx.insert(notificationEvents).values({
      notificationId: created.id,
      actorType: "MERCHANT",
      actorUserId: input.userId,
      event: "CREATED",
      metadata: {
        recipientCount: recipients.length,
        audienceType: input.audienceType,
        scheduled: Boolean(scheduledAt),
      },
      ipAddress: input.ipAddress ?? null,
    });

    return toNotificationDTO(created);
  });
}

export async function createAdminBroadcast(input: {
  userId: string | null;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  audienceType: NotificationAudienceType;
  audienceFilter: NotificationAudienceFilter;
  expiresAt?: string | null;
  ipAddress?: string | null;
}): Promise<AdminCampaignDTO> {
  const recipients = await resolveMerchantAudience(
    input.audienceType,
    input.audienceFilter
  );

  if (recipients.length === 0) {
    throw new MessagingError(
      "NO_RECIPIENTS",
      "No merchants match the selected audience.",
      400
    );
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const now = new Date();

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(notifications)
      .values({
        scope: ADMIN_SCOPE,
        storeId: null,
        senderType: "ADMIN",
        createdByUserId: input.userId,
        title: input.title,
        body: input.body,
        category: input.category,
        priority: input.priority,
        channel: ADMIN_BROADCAST_CHANNEL,
        status: "SENT",
        audienceType: input.audienceType,
        audienceFilter: input.audienceFilter,
        expiresAt,
        sentAt: now,
        recipientCount: recipients.length,
        deliveredCount: recipients.length,
      })
      .returning();

    await insertRecipientRows(
      tx,
      created.id,
      recipients,
      ADMIN_BROADCAST_CHANNEL,
      "SENT",
      now
    );

    await tx.insert(notificationEvents).values({
      notificationId: created.id,
      actorType: "ADMIN",
      actorUserId: input.userId,
      event: "SENT",
      metadata: {
        recipientCount: recipients.length,
        audienceType: input.audienceType,
      },
      ipAddress: input.ipAddress ?? null,
    });

    return {
      ...toNotificationDTO(created),
      storeName: null,
      storeSlug: null,
      senderName: null,
    };
  });
}

export async function dispatchBatch(
  storeId: string,
  notificationId: string,
  options: { ipAddress?: string | null; actorUserId?: string | null } = {}
): Promise<SendBatchResult> {
  const staleBefore = new Date(
    Date.now() - STALE_SENDING_MINUTES * 60 * 1000
  );

  const [claimed] = await db
    .update(notifications)
    .set({ status: "SENDING", updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.storeId, storeId),
        eq(notifications.scope, MERCHANT_SCOPE),
        or(
          inArray(notifications.status, [
            "DRAFT",
            "SCHEDULED",
            "QUEUED",
            "PARTIAL",
          ]),
          and(
            eq(notifications.status, "SENDING"),
            lt(notifications.updatedAt, staleBefore)
          )
        )
      )
    )
    .returning({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      storeId: notifications.storeId,
    });

  if (!claimed || !claimed.storeId) {
    const existing = await db
      .select({ status: notifications.status })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.storeId, storeId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      throw new MessagingError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
    }

    throw new MessagingError(
      "CAMPAIGN_NOT_SENDABLE",
      `Campaign is ${existing[0].status.toLowerCase()} and cannot be sent in its current state.`,
      409
    );
  }

  const pending = await db
    .select({
      id: notificationRecipients.id,
      phone: notificationRecipients.recipientPhone,
    })
    .from(notificationRecipients)
    .where(
      and(
        eq(notificationRecipients.notificationId, notificationId),
        eq(notificationRecipients.status, "PENDING")
      )
    )
    .limit(SEND_BATCH_SIZE);

  let creditsRemaining: number | null = null;

  for (const part of chunk(pending, SEND_CONCURRENCY)) {
    await Promise.all(
      part.map(async (recipient) => {
        const result = recipient.phone
          ? await deliverWhatsAppMessage({
              storeId: claimed.storeId as string,
              phone: recipient.phone,
              title: claimed.title,
              body: claimed.body,
            })
          : {
              status: "FAILED" as const,
              errorCode: "INVALID_PHONE",
              errorMessage: "Recipient has no valid phone number.",
              creditsRemaining: null,
            };

        if (result.creditsRemaining !== null) {
          creditsRemaining = result.creditsRemaining;
        }

        const now = new Date();
        await db
          .update(notificationRecipients)
          .set({
            status: result.status,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            sentAt: result.status === "SENT" ? now : null,
            deliveredAt: result.status === "SENT" ? now : null,
          })
          .where(eq(notificationRecipients.id, recipient.id));
      })
    );
  }

  const [counts] = await db
    .select({
      total: sql<number>`(count(*))::int`,
      delivered: sql<number>`(count(*) filter (where ${notificationRecipients.status} in ('SENT', 'DELIVERED', 'READ')))::int`,
      failed: sql<number>`(count(*) filter (where ${notificationRecipients.status} in ('FAILED', 'SKIPPED')))::int`,
      read: sql<number>`(count(*) filter (where ${notificationRecipients.status} = 'READ'))::int`,
      pending: sql<number>`(count(*) filter (where ${notificationRecipients.status} = 'PENDING'))::int`,
    })
    .from(notificationRecipients)
    .where(eq(notificationRecipients.notificationId, notificationId));

  const total = Number(counts?.total ?? 0);
  const delivered = Number(counts?.delivered ?? 0);
  const failed = Number(counts?.failed ?? 0);
  const read = Number(counts?.read ?? 0);
  const remaining = Number(counts?.pending ?? 0);
  const done = remaining === 0;

  let status: NotificationStatus;
  if (!done) {
    status = "PARTIAL";
  } else if (delivered === 0 && failed > 0) {
    status = "FAILED";
  } else if (failed > 0) {
    status = "PARTIAL";
  } else {
    status = "SENT";
  }

  await db
    .update(notifications)
    .set({
      status,
      deliveredCount: delivered,
      failedCount: failed,
      readCount: read,
      updatedAt: new Date(),
      ...(done ? { sentAt: new Date() } : {}),
    })
    .where(eq(notifications.id, notificationId));

  await db.insert(notificationEvents).values({
    notificationId,
    actorType: options.actorUserId ? "MERCHANT" : "SYSTEM",
    actorUserId: options.actorUserId ?? null,
    event: done ? (failed > 0 ? "PARTIAL" : "SENT") : "BATCH_SENT",
    metadata: {
      processed: pending.length,
      remaining,
      delivered,
      failed,
      total,
    },
    ipAddress: options.ipAddress ?? null,
  });

  return {
    notificationId,
    status,
    processed: pending.length,
    remaining,
    delivered,
    failed,
    total,
    creditsRemaining,
    done,
  };
}

export async function resetFailedRecipients(
  storeId: string,
  notificationId: string
): Promise<number> {
  const [campaign] = await db
    .select({ status: notifications.status })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.storeId, storeId)
      )
    )
    .limit(1);

  if (!campaign) {
    throw new MessagingError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
  }
  if (campaign.status === "SENDING") {
    throw new MessagingError(
      "CAMPAIGN_SENDING",
      "This campaign is currently sending. Try again in a moment.",
      409
    );
  }

  const updated = await db
    .update(notificationRecipients)
    .set({
      status: "PENDING",
      errorCode: null,
      errorMessage: null,
      sentAt: null,
      deliveredAt: null,
    })
    .where(
      and(
        eq(notificationRecipients.notificationId, notificationId),
        inArray(notificationRecipients.status, ["FAILED", "SKIPPED"])
      )
    )
    .returning({ id: notificationRecipients.id });

  return updated.length;
}

export async function cancelCampaign(
  storeId: string,
  notificationId: string,
  actorUserId: string,
  ipAddress?: string | null
): Promise<NotificationDTO> {
  const [updated] = await db
    .update(notifications)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.storeId, storeId),
        inArray(notifications.status, ["DRAFT", "SCHEDULED", "QUEUED"])
      )
    )
    .returning();

  if (!updated) {
    throw new MessagingError(
      "CAMPAIGN_NOT_CANCELLABLE",
      "Only draft, scheduled or queued campaigns can be cancelled.",
      409
    );
  }

  await db.insert(notificationEvents).values({
    notificationId,
    actorType: "MERCHANT",
    actorUserId,
    event: "CANCELLED",
    metadata: {},
    ipAddress: ipAddress ?? null,
  });

  return toNotificationDTO(updated);
}

export async function listCampaigns(
  storeId: string,
  options: { page: number; limit: number; status?: string; search?: string }
): Promise<CampaignListResponse> {
  const conditions = [eq(notifications.storeId, storeId)];
  if (options.status && isNotificationStatus(options.status)) {
    conditions.push(eq(notifications.status, options.status));
  }
  if (options.search) {
    conditions.push(ilike(notifications.title, `%${options.search}%`));
  }
  const where = and(...conditions);
  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow, summaryRow] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notifications)
      .where(where),
    db
      .select({
        total: sql<number>`(count(*))::int`,
        draft: sql<number>`(count(*) filter (where ${notifications.status} = 'DRAFT'))::int`,
        active: sql<number>`(count(*) filter (where ${notifications.status} in ('SCHEDULED', 'QUEUED', 'SENDING')))::int`,
        sent: sql<number>`(count(*) filter (where ${notifications.status} = 'SENT'))::int`,
        partial: sql<number>`(count(*) filter (where ${notifications.status} = 'PARTIAL'))::int`,
        failed: sql<number>`(count(*) filter (where ${notifications.status} = 'FAILED'))::int`,
        totalRecipients: sql<number>`(coalesce(sum(${notifications.recipientCount}), 0))::int`,
        totalDelivered: sql<number>`(coalesce(sum(${notifications.deliveredCount}), 0))::int`,
        totalFailed: sql<number>`(coalesce(sum(${notifications.failedCount}), 0))::int`,
      })
      .from(notifications)
      .where(eq(notifications.storeId, storeId)),
  ]);

  const summary: CampaignSummaryStats = {
    total: Number(summaryRow?.[0]?.total ?? 0),
    draft: Number(summaryRow?.[0]?.draft ?? 0),
    active: Number(summaryRow?.[0]?.active ?? 0),
    sent: Number(summaryRow?.[0]?.sent ?? 0),
    partial: Number(summaryRow?.[0]?.partial ?? 0),
    failed: Number(summaryRow?.[0]?.failed ?? 0),
    totalRecipients: Number(summaryRow?.[0]?.totalRecipients ?? 0),
    totalDelivered: Number(summaryRow?.[0]?.totalDelivered ?? 0),
    totalFailed: Number(summaryRow?.[0]?.totalFailed ?? 0),
  };

  return {
    campaigns: rows.map(toNotificationDTO),
    summary,
    page: options.page,
    total: Number(totalRow?.[0]?.value ?? 0),
    pageSize: options.limit,
  };
}

export async function getCampaign(
  storeId: string,
  notificationId: string
): Promise<NotificationDTO> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.storeId, storeId)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new MessagingError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
  }
  return toNotificationDTO(rows[0]);
}

export async function listRecipients(
  notificationId: string,
  options: { page: number; limit: number; status?: string }
): Promise<{ recipients: RecipientDTO[]; total: number; page: number; pageSize: number }> {
  const conditions = [eq(notificationRecipients.notificationId, notificationId)];
  if (options.status) {
    conditions.push(eq(notificationRecipients.status, options.status));
  }
  const where = and(...conditions);
  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(notificationRecipients)
      .where(where)
      .orderBy(asc(notificationRecipients.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notificationRecipients)
      .where(where),
  ]);

  return {
    recipients: rows.map(toRecipientDTO),
    total: Number(totalRow?.[0]?.value ?? 0),
    page: options.page,
    pageSize: options.limit,
  };
}

export async function listSelectableCustomers(
  storeId: string,
  search?: string
): Promise<
  Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    loyaltyPoints: number;
    totalSpent: number;
  }>
> {
  const conditions = [eq(customers.storeId, storeId)];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(ilike(customers.name, pattern), ilike(customers.phone, pattern))!
    );
  }

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      loyaltyPoints: customers.loyaltyPoints,
      totalLifetimeSpend: customers.totalLifetimeSpend,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    loyaltyPoints: row.loyaltyPoints ?? 0,
    totalSpent: Number(row.totalLifetimeSpend) || 0,
  }));
}

export async function getAudiencePreview(
  storeId: string,
  audienceType: NotificationAudienceType,
  filter: NotificationAudienceFilter
): Promise<AudiencePreview> {
  const [recipients, balance] = await Promise.all([
    resolveCustomerAudience(storeId, audienceType, filter),
    getWhatsAppCreditBalance(storeId),
  ]);

  return {
    audienceType,
    count: recipients.length,
    sample: recipients.slice(0, 5).map((row) => ({
      name: row.name,
      phone: row.phone ? `••••${row.phone.slice(-4)}` : "",
    })),
    estimatedCredits: recipients.length,
    whatsappCredits: balance,
    hasSufficientCredits: balance === null || balance >= recipients.length,
  };
}

export async function getInbox(
  userId: string,
  options: { page: number; limit: number; unreadOnly?: boolean }
): Promise<InboxResponse> {
  const activeFilter = or(
    isNull(notifications.expiresAt),
    gte(notifications.expiresAt, new Date())
  );

  const base = [
    eq(notificationRecipients.userId, userId),
    eq(notificationRecipients.recipientType, "MERCHANT"),
    activeFilter,
  ];

  const where = options.unreadOnly
    ? and(...base, isNull(notificationRecipients.readAt))
    : and(...base);

  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow, unreadRow] = await Promise.all([
    db
      .select({
        recipientId: notificationRecipients.id,
        notificationId: notifications.id,
        title: notifications.title,
        body: notifications.body,
        category: notifications.category,
        priority: notifications.priority,
        status: notificationRecipients.status,
        readAt: notificationRecipients.readAt,
        createdAt: notifications.createdAt,
        expiresAt: notifications.expiresAt,
      })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .where(where),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .where(and(...base, isNull(notificationRecipients.readAt))),
  ]);

  const items: InboxItem[] = rows.map((row) => ({
    recipientId: row.recipientId,
    notificationId: row.notificationId,
    title: row.title,
    body: row.body,
    category: row.category as NotificationCategory,
    priority: row.priority as NotificationPriority,
    status: row.status as RecipientStatus,
    readAt: iso(row.readAt),
    createdAt: row.createdAt.toISOString(),
    expiresAt: iso(row.expiresAt),
  }));

  return {
    items,
    unreadCount: Number(unreadRow?.[0]?.value ?? 0),
    page: options.page,
    pageSize: options.limit,
    total: Number(totalRow?.[0]?.value ?? 0),
  };
}

export async function markInboxRead(
  userId: string,
  input: { ids?: string[]; all?: boolean }
): Promise<number> {
  const conditions = [
    eq(notificationRecipients.userId, userId),
    eq(notificationRecipients.recipientType, "MERCHANT"),
    isNull(notificationRecipients.readAt),
  ];

  if (!input.all) {
    if (!input.ids || input.ids.length === 0) return 0;
    conditions.push(inArray(notificationRecipients.id, input.ids));
  }

  const updated = await db
    .update(notificationRecipients)
    .set({ status: "READ", readAt: new Date() })
    .where(and(...conditions))
    .returning({
      id: notificationRecipients.id,
      notificationId: notificationRecipients.notificationId,
    });

  const byNotification = new Map<string, number>();
  for (const row of updated) {
    byNotification.set(
      row.notificationId,
      (byNotification.get(row.notificationId) ?? 0) + 1
    );
  }

  if (byNotification.size > 0) {
    await db.insert(notificationEvents).values(
      Array.from(byNotification.entries()).map(([notificationId, count]) => ({
        notificationId,
        actorType: "MERCHANT" as const,
        actorUserId: userId,
        event: "READ" as const,
        metadata: { recipients: count },
        ipAddress: null,
      }))
    );
  }

  return updated.length;
}

export async function getNotificationSummary(
  userId: string,
  storeId: string | null
): Promise<NotificationSummary> {
  const unreadPromise = db
    .select({ value: sql<number>`(count(*))::int` })
    .from(notificationRecipients)
    .innerJoin(
      notifications,
      eq(notifications.id, notificationRecipients.notificationId)
    )
    .where(
      and(
        eq(notificationRecipients.userId, userId),
        eq(notificationRecipients.recipientType, "MERCHANT"),
        isNull(notificationRecipients.readAt),
        or(
          isNull(notifications.expiresAt),
          gte(notifications.expiresAt, new Date())
        )
      )
    );

  if (!storeId) {
    const [unreadRow] = await Promise.all([unreadPromise]);
    return {
      unreadCount: Number(unreadRow?.[0]?.value ?? 0),
      draftCount: 0,
      activeCount: 0,
      failedCount: 0,
    };
  }

  const [unreadRow, campaignRow] = await Promise.all([
    unreadPromise,
    db
      .select({
        draft: sql<number>`(count(*) filter (where ${notifications.status} = 'DRAFT'))::int`,
        active: sql<number>`(count(*) filter (where ${notifications.status} in ('SCHEDULED', 'QUEUED', 'SENDING')))::int`,
        failed: sql<number>`(count(*) filter (where ${notifications.status} = 'FAILED'))::int`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.storeId, storeId),
          eq(notifications.scope, MERCHANT_SCOPE)
        )
      ),
  ]);

  return {
    unreadCount: Number(unreadRow?.[0]?.value ?? 0),
    draftCount: Number(campaignRow?.[0]?.draft ?? 0),
    activeCount: Number(campaignRow?.[0]?.active ?? 0),
    failedCount: Number(campaignRow?.[0]?.failed ?? 0),
  };
}

async function listAdminCampaigns(
  scope: NotificationScope,
  options: {
    page: number;
    limit: number;
    storeId?: string;
    search?: string;
  }
): Promise<{
  campaigns: AdminCampaignDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const conditions = [eq(notifications.scope, scope)];
  if (options.storeId) {
    conditions.push(eq(notifications.storeId, options.storeId));
  }
  if (options.search) {
    conditions.push(ilike(notifications.title, `%${options.search}%`));
  }
  const where = and(...conditions);
  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        notification: notifications,
        storeName: stores.name,
        storeSlug: stores.slug,
        senderName: users.name,
      })
      .from(notifications)
      .leftJoin(stores, eq(stores.id, notifications.storeId))
      .leftJoin(users, eq(users.id, notifications.createdByUserId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notifications)
      .where(where),
  ]);

  return {
    campaigns: rows.map((row) => ({
      ...toNotificationDTO(row.notification),
      storeName: row.storeName ?? null,
      storeSlug: row.storeSlug ?? null,
      senderName: row.senderName ?? null,
    })),
    total: Number(totalRow?.[0]?.value ?? 0),
    page: options.page,
    pageSize: options.limit,
  };
}

export function listAdminBroadcasts(options: {
  page: number;
  limit: number;
  search?: string;
}) {
  return listAdminCampaigns(ADMIN_SCOPE, options);
}

export function listAdminMerchantMessages(options: {
  page: number;
  limit: number;
  storeId?: string;
  search?: string;
}) {
  return listAdminCampaigns(MERCHANT_SCOPE, options);
}

export async function getAdminCampaign(
  scope: NotificationScope,
  notificationId: string
): Promise<AdminCampaignDTO> {
  const rows = await db
    .select({
      notification: notifications,
      storeName: stores.name,
      storeSlug: stores.slug,
      senderName: users.name,
    })
    .from(notifications)
    .leftJoin(stores, eq(stores.id, notifications.storeId))
    .leftJoin(users, eq(users.id, notifications.createdByUserId))
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.scope, scope))
    )
    .limit(1);

  if (rows.length === 0) {
    throw new MessagingError("NOTIFICATION_NOT_FOUND", "Not found.", 404);
  }

  const row = rows[0];
  return {
    ...toNotificationDTO(row.notification),
    storeName: row.storeName ?? null,
    storeSlug: row.storeSlug ?? null,
    senderName: row.senderName ?? null,
  };
}

export async function getAdminOverview(): Promise<AdminOverviewStats> {
  const cutoff = new Date(
    Date.now() - RECENT_USERS_DAYS * 24 * 60 * 60 * 1000
  );

  const [
    merchantRow,
    storeRow,
    newUserRow,
    broadcastRow,
    messageRow,
    unreadRow,
  ] = await Promise.all([
    db
      .select({
        value: sql<number>`(count(distinct ${users.id}))::int`,
      })
      .from(users)
      .innerJoin(stores, eq(stores.ownerId, users.id)),
    db.select({ value: sql<number>`(count(*))::int` }).from(stores),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(users)
      .where(gte(users.createdAt, cutoff)),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.scope, ADMIN_SCOPE),
          gte(notifications.createdAt, cutoff)
        )
      ),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.scope, MERCHANT_SCOPE),
          gte(notifications.createdAt, cutoff)
        )
      ),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .where(
        and(
          eq(notifications.scope, ADMIN_SCOPE),
          isNull(notificationRecipients.readAt)
        )
      ),
  ]);

  return {
    totalMerchants: Number(merchantRow?.[0]?.value ?? 0),
    totalStores: Number(storeRow?.[0]?.value ?? 0),
    newUsersLast7Days: Number(newUserRow?.[0]?.value ?? 0),
    broadcastsLast7Days: Number(broadcastRow?.[0]?.value ?? 0),
    messagesLast7Days: Number(messageRow?.[0]?.value ?? 0),
    unreadBroadcasts: Number(unreadRow?.[0]?.value ?? 0),
  };
}

export async function listAdminUsers(options: {
  tab: "all" | "recent";
  days: number;
  q?: string;
  plan?: "free" | "pro";
  page: number;
  limit: number;
}): Promise<AdminUsersResponse> {
  const cutoff = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
  const perTabCutoff = new Date(
    Date.now() - RECENT_USERS_DAYS * 24 * 60 * 60 * 1000
  );

  const conditions = [];
  if (options.tab === "recent") {
    conditions.push(gte(users.createdAt, cutoff));
  }
  if (options.q) {
    const pattern = `%${options.q}%`;
    conditions.push(
      or(ilike(users.name, pattern), ilike(users.email, pattern))
    );
  }
  if (options.plan) {
    conditions.push(
      sql`exists (select 1 from ${stores} where ${stores.ownerId} = ${users.id} and ${stores.plan} = ${options.plan})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow, allRow, recentRow, proRow, noStoreRow] =
    await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(options.limit)
        .offset(offset),
      db
        .select({ value: sql<number>`(count(*))::int` })
        .from(users)
        .where(where),
      db.select({ value: sql<number>`(count(*))::int` }).from(users),
      db
        .select({ value: sql<number>`(count(*))::int` })
        .from(users)
        .where(gte(users.createdAt, perTabCutoff)),
      db
        .select({ value: sql<number>`(count(distinct ${users.id}))::int` })
        .from(users)
        .innerJoin(stores, eq(stores.ownerId, users.id))
        .where(eq(stores.plan, "pro")),
      db
        .select({ value: sql<number>`(count(*))::int` })
        .from(users)
        .where(
          sql`not exists (select 1 from ${stores} where ${stores.ownerId} = ${users.id})`
        ),
    ]);

  const userIds = rows.map((row) => row.id);
  let storeRows: Array<{
    ownerId: string;
    id: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: Date;
  }> = [];
  const productCountMap = new Map<string, number>();

  if (userIds.length > 0) {
    storeRows = await db
      .select({
        ownerId: stores.ownerId,
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        plan: stores.plan,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .where(inArray(stores.ownerId, userIds))
      .orderBy(asc(stores.createdAt));

    const storeIds = storeRows.map((row) => row.id);
    if (storeIds.length > 0) {
      const productRows = await db
        .select({
          storeId: products.storeId,
          value: sql<number>`(count(*))::int`,
        })
        .from(products)
        .where(inArray(products.storeId, storeIds))
        .groupBy(products.storeId);
      for (const row of productRows) {
        productCountMap.set(row.storeId, Number(row.value ?? 0));
      }
    }
  }

  const primaryStoreByUser = new Map<string, (typeof storeRows)[number]>();
  for (const row of storeRows) {
    if (!primaryStoreByUser.has(row.ownerId)) {
      primaryStoreByUser.set(row.ownerId, row);
    }
  }

  const mapped: AdminUserRow[] = rows.map((row) => {
    const store = primaryStoreByUser.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      isNew: row.createdAt >= perTabCutoff,
      store: store
        ? {
            id: store.id,
            name: store.name,
            slug: store.slug,
            plan: store.plan,
            productCount: productCountMap.get(store.id) ?? 0,
          }
        : null,
    };
  });

  const counts: AdminUserCounts = {
    all: Number(allRow?.[0]?.value ?? 0),
    recent: Number(recentRow?.[0]?.value ?? 0),
    pro: Number(proRow?.[0]?.value ?? 0),
    noStore: Number(noStoreRow?.[0]?.value ?? 0),
  };

  return {
    users: mapped,
    counts,
    page: options.page,
    pageSize: options.limit,
    total: Number(totalRow?.[0]?.value ?? 0),
    tab: options.tab,
    days: options.days,
  };
}

export interface AdminMessageRecipientRow {
  id: string;
  notificationId: string;
  campaignTitle: string;
  scope: NotificationScope;
  status: RecipientStatus;
  recipientType: "CUSTOMER" | "MERCHANT";
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  channel: NotificationChannel;
  storeId: string | null;
  storeName: string | null;
  storeSlug: string | null;
  senderName: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AdminMessageRecipientsResponse {
  recipients: AdminMessageRecipientRow[];
  total: number;
  page: number;
  pageSize: number;
}

function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim();
  if (!value || !value.includes("@")) return "";
  const [local, domain] = value.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

/** Individual delivery rows across merchant campaigns and admin broadcasts. */
export async function listAdminMessageRecipients(options: {
  page: number;
  limit: number;
  storeId?: string;
  search?: string;
  status?: string;
}): Promise<AdminMessageRecipientsResponse> {
  const conditions = [];
  if (options.storeId) {
    conditions.push(
      or(
        eq(notificationRecipients.storeId, options.storeId),
        eq(notifications.storeId, options.storeId)
      )!
    );
  }
  if (options.status) {
    conditions.push(eq(notificationRecipients.status, options.status));
  }
  if (options.search) {
    const pattern = `%${options.search}%`;
    conditions.push(
      or(
        ilike(notificationRecipients.recipientName, pattern),
        ilike(notificationRecipients.recipientPhone, pattern),
        ilike(notificationRecipients.recipientEmail, pattern),
        ilike(notifications.title, pattern)
      )!
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (options.page - 1) * options.limit;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        recipient: notificationRecipients,
        notificationTitle: notifications.title,
        notificationScope: notifications.scope,
        storeName: stores.name,
        storeSlug: stores.slug,
        senderName: users.name,
      })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .leftJoin(stores, eq(stores.id, notificationRecipients.storeId))
      .leftJoin(users, eq(users.id, notifications.createdByUserId))
      .where(where)
      .orderBy(desc(notificationRecipients.createdAt))
      .limit(options.limit)
      .offset(offset),
    db
      .select({ value: sql<number>`(count(*))::int` })
      .from(notificationRecipients)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationRecipients.notificationId)
      )
      .where(where),
  ]);

  return {
    recipients: rows.map((row) => ({
      id: row.recipient.id,
      notificationId: row.recipient.notificationId,
      campaignTitle: row.notificationTitle,
      scope: row.notificationScope as NotificationScope,
      status: row.recipient.status as RecipientStatus,
      recipientType: row.recipient.recipientType as "CUSTOMER" | "MERCHANT",
      recipientName: row.recipient.recipientName ?? "",
      recipientPhone: maskPhone(row.recipient.recipientPhone),
      recipientEmail: maskEmail(row.recipient.recipientEmail),
      channel: row.recipient.channel as NotificationChannel,
      storeId: row.recipient.storeId,
      storeName: row.storeName ?? null,
      storeSlug: row.storeSlug ?? null,
      senderName: row.senderName ?? null,
      sentAt: iso(row.recipient.sentAt),
      deliveredAt: iso(row.recipient.deliveredAt),
      readAt: iso(row.recipient.readAt),
      createdAt: row.recipient.createdAt.toISOString(),
    })),
    total: Number(totalRow?.[0]?.value ?? 0),
    page: options.page,
    pageSize: options.limit,
  };
}

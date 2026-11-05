import type {
  NotificationAudienceFilter,
  NotificationAudienceType,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationScope,
  NotificationStatus,
  RecipientStatus,
} from "@/db/schema";

export interface NotificationDTO {
  id: string;
  scope: NotificationScope;
  storeId: string | null;
  senderType: "MERCHANT" | "ADMIN";
  createdByUserId: string | null;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  channel: NotificationChannel;
  status: NotificationStatus;
  audienceType: NotificationAudienceType;
  audienceFilter: NotificationAudienceFilter;
  scheduledAt: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCampaignDTO extends NotificationDTO {
  storeName: string | null;
  storeSlug: string | null;
  senderName: string | null;
}

export interface RecipientDTO {
  id: string;
  notificationId: string;
  recipientType: "CUSTOMER" | "MERCHANT";
  customerId: string | null;
  userId: string | null;
  name: string;
  phone: string;
  email: string;
  channel: NotificationChannel;
  status: RecipientStatus;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CampaignSummaryStats {
  total: number;
  draft: number;
  active: number;
  sent: number;
  partial: number;
  failed: number;
  totalRecipients: number;
  totalDelivered: number;
  totalFailed: number;
}

export interface CampaignListResponse {
  campaigns: NotificationDTO[];
  summary: CampaignSummaryStats;
  page: number;
  total: number;
  pageSize: number;
}

export interface AudienceSample {
  name: string;
  phone: string;
}

export interface AudiencePreview {
  audienceType: NotificationAudienceType;
  count: number;
  sample: AudienceSample[];
  estimatedCredits: number;
  whatsappCredits: number | null;
  hasSufficientCredits: boolean;
}

export interface SendBatchResult {
  notificationId: string;
  status: NotificationStatus;
  processed: number;
  remaining: number;
  delivered: number;
  failed: number;
  total: number;
  creditsRemaining: number | null;
  done: boolean;
}

export interface InboxItem {
  recipientId: string;
  notificationId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: RecipientStatus;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface InboxResponse {
  items: InboxItem[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationSummary {
  unreadCount: number;
  draftCount: number;
  activeCount: number;
  failedCount: number;
}

export interface AdminOverviewStats {
  totalMerchants: number;
  totalStores: number;
  newUsersLast7Days: number;
  broadcastsLast7Days: number;
  messagesLast7Days: number;
  unreadBroadcasts: number;
}

export interface AdminUserStore {
  id: string;
  name: string;
  slug: string;
  plan: string;
  productCount: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  isNew: boolean;
  store: AdminUserStore | null;
}

export interface AdminUserCounts {
  all: number;
  recent: number;
  pro: number;
  noStore: number;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  counts: AdminUserCounts;
  page: number;
  pageSize: number;
  total: number;
  tab: "all" | "recent";
  days: number;
}

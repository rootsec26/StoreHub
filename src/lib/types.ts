export const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
  "Shipped",
  "Completed",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  totalAmount: string;
  status: OrderStatus;
  createdAt: string;
}

export interface CustomerSummary {
  phone: string;
  name: string;
  totalOrders: number;
  totalSpent: string;
  lastOrderAt: string;
}

export interface CustomersSummaryStats {
  totalCustomers: number;
  totalRevenue: string;
  repeatCustomers: number;
  avgOrderValue: string;
}

export interface CustomersResponse {
  customers: CustomerSummary[];
  summary: CustomersSummaryStats;
}

export interface OrdersSummary {
  pendingCount: number;
  pendingIds: string[];
}

export type Plan = "free" | "pro";

export interface BillingInfo {
  plan: Plan;
  /** Strict: false once `plan_expires_at` has lapsed (paid features off). */
  planActive: boolean;
  /** ISO timestamp of the paid-plan window end; null on the free plan. */
  planExpiresAt: string | null;
  productCount: number;
  /** Max products allowed on the plan; `null` means unlimited. */
  productLimit: number | null;
  /** 0-100, capped. Always 0 on unlimited plans. */
  usagePercent: number;
  storeId: string;
  storeName: string;
  /** Pay-per-use AI balance (deducted by every AI generation). */
  aiCredits: number;
  /** ISO timestamp; AI credits are unusable past this date. */
  aiCreditsExpiresAt: string | null;
  /** Pay-per-use WhatsApp balance. */
  whatsappCredits: number;
  /** ISO timestamp; WhatsApp credits are unusable past this date. */
  waCreditsExpiresAt: string | null;
  /** Monthly white-label add-on ("Powered by StoreHub" removed). */
  hasWhiteLabel: boolean;
  /** Admin seats available (1 included + purchased extras). */
  maxStaffSeats: number;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  /** Completed-only revenue for the bucket. */
  revenue: string;
  /** Orders received in the bucket (excluding Cancelled). */
  orders: number;
  /** Completed orders in the bucket — denominator for revenue metrics (AOV). */
  completedOrders: number;
}

export interface AnalyticsTopProduct {
  productId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  revenue: string;
}

export interface AnalyticsSummary {
  totalOrders: number;
  totalRevenue: string;
  avgOrderValue: string;
}

export interface AnalyticsResponse {
  summary: AnalyticsSummary;
  daily: AnalyticsBucket[];
  weekly: AnalyticsBucket[];
  topProducts: AnalyticsTopProduct[];
}

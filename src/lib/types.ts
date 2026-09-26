export const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Preparing",
  "Ready",
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
  productCount: number;
  /** Max products allowed on the plan; `null` means unlimited. */
  productLimit: number | null;
  /** 0-100, capped. Always 0 on unlimited plans. */
  usagePercent: number;
  storeId: string;
  storeName: string;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  revenue: string;
  orders: number;
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

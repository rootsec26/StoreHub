export type AdminAnalyticsPeriod = "daily" | "weekly";

export interface AdminAnalyticsRevenueCurrency {
  currency: string;
  amount: string;
  orders: number;
}

export interface AdminAnalyticsSummary {
  uniqueVisitors: number;
  pageViews: number;
  totalUsers: number;
  usersLast7Days: number;
  totalOrders: number;
  revenueByCurrency: AdminAnalyticsRevenueCurrency[];
  signups: number;
  orders: number;
  convertedVisitors: number;
  conversionRate: number;
}

export interface AdminAnalyticsPeriodSummary {
  uniqueVisitors: number;
  pageViews: number;
  signups: number;
  orders: number;
  convertedVisitors: number;
  conversionRate: number;
}

export interface AdminAnalyticsBucket {
  key: string;
  label: string;
  pageViews: number;
  uniqueVisitors: number;
  signups: number;
  orders: number;
  convertedVisitors: number;
  conversionRate: number;
}

export type AdminAnalyticsActivityType =
  | "PAGE_VIEW"
  | "REGISTRATION"
  | "ORDER";

export interface AdminAnalyticsActivityItem {
  id: string;
  type: AdminAnalyticsActivityType;
  title: string;
  detail: string;
  createdAt: string;
}

export interface AdminAnalyticsResponse {
  generatedAt: string;
  period: AdminAnalyticsPeriod;
  trackingAvailable: boolean;
  summary: AdminAnalyticsSummary;
  periodSummary: AdminAnalyticsPeriodSummary;
  series: AdminAnalyticsBucket[];
  recentActivity: AdminAnalyticsActivityItem[];
}

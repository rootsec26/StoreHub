"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Package,
  ReceiptText,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from "lucide-react";

import Tabs from "@/components/ui/Tabs";
import type {
  categories,
  customers,
  orders,
  products,
  stores,
} from "@/db/schema";

type StoreRow = typeof stores.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;

interface StoreDetailsTabsProps {
  store: StoreRow;
  owner: { name: string; email: string } | null;
  products: ProductRow[];
  categories: CategoryRow[];
  orders: OrderRow[];
  customers: CustomerRow[];
  orderStats: { count: number; revenue: string | null };
  orderItemCounts: Record<string, number>;
}

function formatMoney(amount: string | number | null | undefined, currency: string) {
  const value = Number(amount ?? 0);
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: currency || "EGP",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusClasses(status: string) {
  const normalized = status.toUpperCase();
  if (["DELIVERED", "COMPLETED", "VERIFIED"].includes(normalized))
    return "bg-emerald-50 text-emerald-700";
  if (["CANCELLED", "CANCELED", "RETURNED", "FAILED", "REJECTED"].includes(normalized))
    return "bg-rose-50 text-rose-700";
  if (["SHIPPED", "OUT_FOR_DELIVERY", "IN_TRANSIT"].includes(normalized))
    return "bg-indigo-50 text-indigo-700";
  if (["PENDING", "PENDING_VERIFICATION", "UNPAID"].includes(normalized))
    return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      {title && (
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
      )}
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="py-8 text-center text-sm text-slate-500">{label}</p>
  );
}

export default function StoreDetailsTabs({
  store,
  owner,
  products,
  categories,
  orders,
  customers,
  orderStats,
  orderItemCounts,
}: StoreDetailsTabsProps) {
  const [tab, setTab] = useState("overview");
  const currency = store.currency || "EGP";

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const productCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      if (product.categoryId) {
        map.set(product.categoryId, (map.get(product.categoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const visibleProducts = products.filter((p) => p.isVisible).length;
  const lowStockProducts = products.filter((p) => p.stock <= 5).length;
  const revenue = orderStats.revenue != null ? Number(orderStats.revenue) : 0;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products", count: products.length },
    { id: "orders", label: "Orders", count: orderStats.count },
    { id: "customers", label: "Customers", count: customers.length },
    { id: "categories", label: "Categories", count: categories.length },
  ];

  return (
    <div className="space-y-4">
      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Package}
              label="Products"
              value={`${visibleProducts} visible / ${products.length} total`}
              hint={
                lowStockProducts > 0
                  ? `${lowStockProducts} low on stock`
                  : "All stock healthy"
              }
            />
            <StatCard
              icon={ReceiptText}
              label="Orders"
              value={orderStats.count.toLocaleString("en-US")}
              hint={`${formatMoney(revenue, currency)} revenue (all time)`}
            />
            <StatCard
              icon={Users}
              label="Customers"
              value={customers.length.toLocaleString("en-US")}
              hint="Registered buyers"
            />
            <StatCard
              icon={Tag}
              label="Categories"
              value={categories.length.toLocaleString("en-US")}
              hint="Store catalog groups"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Store profile">
              <dl className="space-y-3 text-sm">
                <DetailRow label="Name" value={store.name} />
                <DetailRow
                  label="Slug"
                  value={
                    <Link
                      href={`/store/${store.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      /{store.slug}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  }
                />
                <DetailRow
                  label="Plan"
                  value={
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        store.plan === "pro"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {store.plan === "pro" ? "Pro" : "Free"}
                    </span>
                  }
                />
                <DetailRow label="Currency" value={store.currency || "EGP"} />
                <DetailRow label="Category" value={store.category || "—"} />
                <DetailRow label="Phone" value={store.phone || "—"} />
                <DetailRow label="Address" value={store.address || "—"} />
                <DetailRow label="Created" value={formatDate(store.createdAt)} />
                {store.planExpiresAt && (
                  <DetailRow
                    label="Plan expires"
                    value={formatDate(store.planExpiresAt)}
                  />
                )}
              </dl>
              {store.description && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  {store.description}
                </p>
              )}
            </Panel>

            <Panel title="Ownership & billing">
              <dl className="space-y-3 text-sm">
                <DetailRow label="Owner" value={owner?.name || "—"} />
                <DetailRow label="Owner email" value={owner?.email || "—"} />
                <DetailRow
                  label="Stripe"
                  value={
                    store.stripeEnabled
                      ? `Enabled${store.stripeAccountId ? ` · ${store.stripeAccountId}` : ""}`
                      : "Disabled"
                  }
                />
                <DetailRow
                  label="Paddle"
                  value={store.paddleEnabled ? "Enabled" : "Disabled"}
                />
                <DetailRow
                  label="AI credits"
                  value={store.aiCredits.toLocaleString("en-US")}
                />
                <DetailRow
                  label="WhatsApp credits"
                  value={store.whatsappCredits.toLocaleString("en-US")}
                />
                <DetailRow
                  label="White label"
                  value={store.hasWhiteLabel ? "Yes" : "No"}
                />
                <DetailRow
                  label="Staff seats"
                  value={store.maxStaffSeats.toLocaleString("en-US")}
                />
              </dl>
            </Panel>
          </div>
        </div>
      )}

      {tab === "products" && (
        <Panel>
          {products.length === 0 ? (
            <Empty label="No products in this store" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-4">Product</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4 text-right">Price</th>
                    <th className="pb-3 pr-4 text-right">Stock</th>
                    <th className="pb-3 pr-4">Visibility</th>
                    <th className="pb-3 text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => (
                    <tr key={product.id} className="text-sm">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                              <ShoppingBag className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {product.name}
                            </p>
                            {product.description && (
                              <p className="max-w-xs truncate text-xs text-slate-500">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {product.categoryId
                          ? (categoryNameById.get(product.categoryId) ?? "—")
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-900">
                        {formatMoney(product.price, currency)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className={`font-semibold ${
                            product.stock <= 5
                              ? "text-amber-600"
                              : "text-slate-900"
                          }`}
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.isVisible
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {product.isVisible ? "Visible" : "Hidden"}
                        </span>
                      </td>
                      <td className="py-3 text-right text-slate-500">
                        {formatDate(product.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "orders" && (
        <Panel>
          {orders.length === 0 ? (
            <Empty label="No orders for this store" />
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">
                        {order.customerName || "Guest"}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(order.status)}`}
                      >
                        {order.status}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {order.paymentStatus}
                      </span>
                      {order.channel !== "online" && (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          {order.channel}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {order.customerPhone || "No phone"}
                      {order.customerAddress
                        ? ` · ${order.customerAddress}`
                        : ""}
                      {" · "}
                      {orderItemCounts[order.id] ?? 0} item
                      {(orderItemCounts[order.id] ?? 0) === 1 ? "" : "s"}
                      {" · "}
                      {formatDate(order.createdAt)}
                    </p>
                    {order.trackingNumber && (
                      <p className="mt-1 text-xs text-slate-500">
                        Tracking: {order.trackingNumber}
                        {order.courierName ? ` · ${order.courierName}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-900">
                      {formatMoney(order.totalAmount, currency)}
                    </p>
                    {Number(order.discountAmount) > 0 && (
                      <p className="text-xs text-emerald-600">
                        −{formatMoney(order.discountAmount, currency)} discount
                        {order.couponCode ? ` (${order.couponCode})` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {orders.length === 100 && (
                <p className="pt-2 text-center text-xs text-slate-500">
                  Showing the 100 most recent orders
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "customers" && (
        <Panel>
          {customers.length === 0 ? (
            <Empty label="No customers for this store" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-4">Customer</th>
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4 text-right">Loyalty pts</th>
                    <th className="pb-3 pr-4 text-right">Lifetime spend</th>
                    <th className="pb-3 text-right">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="text-sm">
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {customer.name || "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {customer.phone || "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {customer.email || "—"}
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-900">
                        {customer.loyaltyPoints.toLocaleString("en-US")}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-900">
                        {formatMoney(customer.totalLifetimeSpend, currency)}
                      </td>
                      <td className="py-3 text-right text-slate-500">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customers.length === 100 && (
                <p className="pt-3 text-center text-xs text-slate-500">
                  Showing the 100 most recent customers
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "categories" && (
        <Panel>
          {categories.length === 0 ? (
            <Empty label="No categories in this store" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => {
                const productTotal = productCountByCategory.get(category.id) ?? 0;
                const visibleInCategory = products.filter(
                  (p) => p.categoryId === category.id && p.isVisible
                ).length;
                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">
                        {category.name}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {productTotal} product{productTotal === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {visibleInCategory} visible · created{" "}
                      {formatDate(category.createdAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";

import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import Skeleton from "@/components/ui/Skeleton";
import type { AdminUsersResponse } from "@/lib/messaging/types";

interface CustomerRow {
  key: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  phone: string;
  name: string;
  email: string;
  address: string;
  loyaltyPoints: number;
  lifetimeSpend: string;
  totalOrders: number;
  completedOrders: number;
  totalSpent: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  imageUrl: string | null;
}

interface CustomerOrder {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: string;
  createdAt: string;
  items: OrderItem[];
}

interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface StoreOption {
  id: string;
  name: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "0";
}

export default function CustomersManager() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [ordersByKey, setOrdersByKey] = useState<Record<string, CustomerOrder[]>>({});
  const [ordersLoading, setOrdersLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users?tab=all&limit=100", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AdminUsersResponse | null) => {
        if (cancelled || !data) return;
        const seen = new Set<string>();
        const options: StoreOption[] = [];
        for (const user of data.users) {
          if (user.store && !seen.has(user.store.id)) {
            seen.add(user.store.id);
            options.push({ id: user.store.id, name: user.store.name });
          }
        }
        setStores(options);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/admin/customers?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load customers");
      const data = (await res.json()) as CustomersResponse;
      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 25);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggleOrders(customer: CustomerRow) {
    if (expandedKey === customer.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(customer.key);
    if (ordersByKey[customer.key]) return;

    setOrdersLoading((current) => ({ ...current, [customer.key]: true }));
    try {
      const params = new URLSearchParams({
        storeId: customer.storeId,
        phone: customer.phone,
      });
      const res = await fetch(`/api/admin/customers/orders?${params}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { orders?: CustomerOrder[] }) : { orders: [] };
      setOrdersByKey((current) => ({ ...current, [customer.key]: data.orders ?? [] }));
    } catch {
      setOrdersByKey((current) => ({ ...current, [customer.key]: [] }));
    } finally {
      setOrdersLoading((current) => ({ ...current, [customer.key]: false }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Buyers and registered customers aggregated from orders across every merchant store.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
          <Users className="h-3.5 w-3.5" />
          {total.toLocaleString("en-US")} customers
        </span>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, email or store"
            className="w-72 ps-9"
          />
        </div>
        <Select
          value={storeId}
          onChange={(event) => {
            setStoreId(event.target.value);
            setPage(1);
          }}
          className="w-56"
          aria-label="Filter by store"
        >
          <option value="">All stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ms-auto h-4 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No customers found"
            description="Customer records appear after buyers place orders in a store."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50">
                <tr>
                  {["Customer", "Store", "Contact", "Orders", "Spent", "Last order", ""].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => {
                  const expanded = expandedKey === customer.key;
                  const orders = ordersByKey[customer.key] ?? [];
                  return [
                    <tr key={customer.key} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{customer.name}</p>
                            <p className="text-xs text-slate-500">{customer.email || "No email"}</p>
                          </div>
                          {customer.loyaltyPoints > 0 && (
                            <Badge tone="amber">{customer.loyaltyPoints} pts</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900">{customer.storeName}</p>
                            <p className="text-xs text-slate-500">/{customer.storeSlug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <p className="font-mono text-xs">{customer.phone || "—"}</p>
                        <p className="line-clamp-1 text-xs text-slate-400">{customer.address || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-600">
                        {customer.totalOrders}
                        <span className="text-xs text-slate-400"> ({customer.completedOrders} done)</span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold tabular-nums text-slate-900">
                        {formatMoney(customer.totalSpent)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDate(customer.lastOrderAt)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => void toggleOrders(customer)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Orders
                        </button>
                      </td>
                    </tr>,
                    expanded ? (
                      <tr key={`${customer.key}-orders`} className="bg-slate-50/60">
                        <td colSpan={7} className="px-4 py-4">
                          {ordersLoading[customer.key] ? (
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-48" />
                              <Skeleton className="h-20 w-full" />
                            </div>
                          ) : orders.length === 0 ? (
                            <p className="text-sm text-slate-500">No orders found for this contact.</p>
                          ) : (
                            <div className="space-y-3">
                              {orders.map((order) => (
                                <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        Order #{order.id.slice(0, 8)}
                                      </p>
                                      <p className="text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                                      <Badge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                                      <span className="text-sm font-bold text-slate-900">{formatMoney(order.totalAmount)}</span>
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-1.5">
                                    {order.items.map((item) => (
                                      <div key={`${order.id}-${item.productId}`} className="flex items-center justify-between gap-3 text-sm">
                                        <span className="min-w-0 truncate text-slate-700">
                                          {item.productName} <span className="text-slate-400">× {item.quantity}</span>
                                        </span>
                                        <span className="shrink-0 font-medium text-slate-900">
                                          {formatMoney(Number(item.unitPrice) * item.quantity)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">{total.toLocaleString("en-US")} customers</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs text-slate-600">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

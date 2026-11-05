import Link from "next/link";
import { desc, eq, inArray, sum } from "drizzle-orm";
import { count } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  customers,
  orderItems,
  orders,
  products,
  stores,
  users,
} from "@/db/schema";
import { isAdminAuthorized } from "@/lib/admin";

import StoreDetailsTabs from "./StoreDetailsTabs";

export const runtime = "nodejs";

async function getMerchantsData() {
  let allUsers: Array<{
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  }> = [];
  let allStores: Array<{
    id: string;
    ownerId: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: Date;
  }> = [];
  let productCounts: Array<{ storeId: string; count: number }> = [];
  let dbError: Error | null = null;

  try {
    allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users);
  } catch (error) {
    dbError = error instanceof Error ? error : new Error("Failed to fetch users");
    console.error("Error fetching users:", error);
  }

  try {
    allStores = await db
      .select({
        id: stores.id,
        ownerId: stores.ownerId,
        name: stores.name,
        slug: stores.slug,
        plan: stores.plan,
        createdAt: stores.createdAt,
      })
      .from(stores);
  } catch (error) {
    dbError =
      error instanceof Error ? error : new Error("Failed to fetch stores");
    console.error("Error fetching stores:", error);
  }

  try {
    productCounts = await db
      .select({
        storeId: products.storeId,
        count: count(),
      })
      .from(products)
      .groupBy(products.storeId);
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch product counts");
    console.error("Error fetching product counts:", error);
  }

  const productCountMap = new Map(
    productCounts.map((p) => [p.storeId, Number(p.count)])
  );

  const merchants = allUsers.map((user) => {
    const userStores = allStores.filter((s) => s.ownerId === user.id);
    const primaryStore = userStores[0];
    const productCount = primaryStore
      ? productCountMap.get(primaryStore.id) ?? 0
      : 0;
    const plan = primaryStore ? primaryStore.plan : "free";

    return { user, store: primaryStore, productCount, plan };
  });

  return { merchants, dbError };
}

async function getStoreDetails(storeId: string) {
  let store: typeof stores.$inferSelect | null = null;
  let storeProducts: Array<typeof products.$inferSelect> = [];
  let storeCategories: Array<typeof categories.$inferSelect> = [];
  let storeOrders: Array<typeof orders.$inferSelect> = [];
  let storeCustomers: Array<typeof customers.$inferSelect> = [];
  let orderStats: { count: number; revenue: string | null } = {
    count: 0,
    revenue: null,
  };
  let orderItemCounts: Record<string, number> = {};
  let dbError: Error | null = null;

  try {
    const rows = await db
      .select()
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    store = rows[0] ?? null;
  } catch (error) {
    dbError =
      error instanceof Error ? error : new Error("Failed to fetch store");
    console.error("Error fetching store:", error);
  }

  try {
    storeProducts = await db
      .select()
      .from(products)
      .where(eq(products.storeId, storeId))
      .orderBy(desc(products.createdAt));
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch store products");
    console.error("Error fetching store products:", error);
  }

  try {
    storeCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.storeId, storeId));
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch store categories");
    console.error("Error fetching store categories:", error);
  }

  try {
    storeOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.storeId, storeId))
      .orderBy(desc(orders.createdAt))
      .limit(100);
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch store orders");
    console.error("Error fetching store orders:", error);
  }

  try {
    const statsRows = await db
      .select({ count: count(), revenue: sum(orders.totalAmount) })
      .from(orders)
      .where(eq(orders.storeId, storeId));
    orderStats = {
      count: Number(statsRows[0]?.count ?? 0),
      revenue: statsRows[0]?.revenue ?? null,
    };
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch store order stats");
    console.error("Error fetching store order stats:", error);
  }

  if (storeOrders.length > 0) {
    try {
      const itemRows = await db
        .select({ orderId: orderItems.orderId, count: count() })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            storeOrders.map((order) => order.id)
          )
        )
        .groupBy(orderItems.orderId);
      orderItemCounts = Object.fromEntries(
        itemRows.map((row) => [row.orderId, Number(row.count)])
      );
    } catch (error) {
      dbError =
        error instanceof Error
          ? error
          : new Error("Failed to fetch store order items");
      console.error("Error fetching store order items:", error);
    }
  }

  try {
    storeCustomers = await db
      .select()
      .from(customers)
      .where(eq(customers.storeId, storeId))
      .orderBy(desc(customers.createdAt))
      .limit(100);
  } catch (error) {
    dbError =
      error instanceof Error
        ? error
        : new Error("Failed to fetch store customers");
    console.error("Error fetching store customers:", error);
  }

  return {
    store,
    products: storeProducts,
    categories: storeCategories,
    orders: storeOrders,
    customers: storeCustomers,
    orderStats,
    orderItemCounts,
    dbError,
  };
}

export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const allowed = await isAdminAuthorized();
  if (!allowed) return <AdminOnly />;

  const params = await searchParams;
  const selectedStoreId = params.store;

  const merchantsResult = await getMerchantsData();
  const merchants = merchantsResult.merchants;

  const dbErrors = [merchantsResult.dbError].filter(Boolean) as Error[];

  let storeDetails: {
    store: typeof stores.$inferSelect | null;
    products: Array<typeof products.$inferSelect>;
    categories: Array<typeof categories.$inferSelect>;
    orders: Array<typeof orders.$inferSelect>;
    customers: Array<typeof customers.$inferSelect>;
    orderStats: { count: number; revenue: string | null };
    orderItemCounts: Record<string, number>;
  } | null = null;

  if (selectedStoreId) {
    const result = await getStoreDetails(selectedStoreId);
    storeDetails = {
      store: result.store,
      products: result.products,
      categories: result.categories,
      orders: result.orders,
      customers: result.customers,
      orderStats: result.orderStats,
      orderItemCounts: result.orderItemCounts,
    };
    if (result.dbError) dbErrors.push(result.dbError);
  }

  return (
    <div className="space-y-6">
      {dbErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">
            Database schema not synced or a query failed. Some data may be
            missing.
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer underline">Details</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">
              {dbErrors.map((e, i) => `${i + 1}. ${e.message}`).join("\n")}
            </pre>
          </details>
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Merchants
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {merchants.length.toLocaleString("en-US")} accounts ·{" "}
              {merchants.filter((m) => m.plan === "pro").length} on Pro
            </p>
          </div>
          <Link
            href="/admin/users"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Manage users →
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Merchant",
                    "Store",
                    "Plan",
                    "Products",
                    "Joined",
                    "Actions",
                  ].map((header) => (
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
                {merchants.map((merchant) => (
                  <tr
                    key={merchant.user.id}
                    className="hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {merchant.user.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {merchant.user.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {merchant.store ? (
                        <>
                          <p className="font-medium text-slate-900">
                            {merchant.store.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            /{merchant.store.slug}
                          </p>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">No store</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          merchant.plan === "pro"
                            ? "bg-indigo-50 text-indigo-600"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {merchant.plan === "pro" ? "Pro" : "Free"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {merchant.productCount}{" "}
                      {merchant.plan === "pro" ? "(∞)" : "/ 15"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(merchant.user.createdAt).toLocaleDateString(
                        "en-US"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {merchant.store && (
                        <Link
                          href={`/admin/merchants?store=${merchant.store.id}`}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          View details
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedStoreId && storeDetails?.store && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Store details: {storeDetails.store.name}
            </h2>
            <Link
              href="/admin/merchants"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              ← Back to all merchants
            </Link>
          </div>

          <StoreDetailsTabs
            store={storeDetails.store}
            owner={
              merchants.find((m) => m.store?.id === selectedStoreId)?.user ??
              null
            }
            products={storeDetails.products}
            categories={storeDetails.categories}
            orders={storeDetails.orders}
            customers={storeDetails.customers}
            orderStats={storeDetails.orderStats}
            orderItemCounts={storeDetails.orderItemCounts}
          />
        </section>
      )}
    </div>
  );
}

function AdminOnly() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-lg text-slate-500">
          Admin panel is only accessible on localhost
        </p>
      </div>
    </div>
  );
}

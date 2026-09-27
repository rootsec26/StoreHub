import { headers } from "next/headers";
import { db } from "@/db";
import { users, stores, products, activationCodes, categories } from "@/db/schema";
import { eq, count, desc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

async function isLocalhostRequest(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return true;
  }

  const xForwardedFor = headersList.get("x-forwarded-for") || "";
  const xRealIp = headersList.get("x-real-ip") || "";

  const clientIp = xForwardedFor.split(",")[0]?.trim() || xRealIp || "";

  return (
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp.startsWith("192.168.") ||
    clientIp.startsWith("10.") ||
    clientIp.startsWith("172.16.") ||
    clientIp.startsWith("172.17.") ||
    clientIp.startsWith("172.18.") ||
    clientIp.startsWith("172.19.") ||
    clientIp.startsWith("172.20.") ||
    clientIp.startsWith("172.21.") ||
    clientIp.startsWith("172.22.") ||
    clientIp.startsWith("172.23.") ||
    clientIp.startsWith("172.24.") ||
    clientIp.startsWith("172.25.") ||
    clientIp.startsWith("172.26.") ||
    clientIp.startsWith("172.27.") ||
    clientIp.startsWith("172.28.") ||
    clientIp.startsWith("172.29.") ||
    clientIp.startsWith("172.30.") ||
    clientIp.startsWith("172.31.")
  );
}

async function getMerchantsData() {
  let allUsers: Array<{ id: string; email: string; name: string; createdAt: Date }> = [];
  let allStores: Array<{ id: string; ownerId: string; name: string; slug: string; plan: string; createdAt: Date }> = [];
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
    dbError = error instanceof Error ? error : new Error("Failed to fetch stores");
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
    dbError = error instanceof Error ? error : new Error("Failed to fetch product counts");
    console.error("Error fetching product counts:", error);
  }

  const productCountMap = new Map(productCounts.map((p) => [p.storeId, Number(p.count)]));

  const merchants = allUsers.map((user) => {
    const userStores = allStores.filter((s) => s.ownerId === user.id);
    const primaryStore = userStores[0];
    const productCount = primaryStore ? productCountMap.get(primaryStore.id) || 0 : 0;
    const plan = primaryStore ? primaryStore.plan : "free";

    return {
      user,
      store: primaryStore,
      productCount,
      plan,
    };
  });

  return { merchants, dbError };
}

async function getActivationCodesData() {
  let codes: Array<typeof activationCodes.$inferSelect> = [];
  let dbError: Error | null = null;

  try {
    codes = await db
      .select()
      .from(activationCodes)
      .orderBy(desc(activationCodes.createdAt));
  } catch (error) {
    if (error instanceof Error && error.message.includes('relation "activation_codes" does not exist')) {
      codes = [];
    } else {
      dbError = error instanceof Error ? error : new Error("Failed to fetch activation codes");
      console.error("Error fetching activation codes:", error);
    }
  }

  return { codes, dbError };
}

async function getStoreDetails(storeId: string) {
  let storeProducts: Array<typeof products.$inferSelect> = [];
  let storeCategories: Array<typeof categories.$inferSelect> = [];
  let dbError: Error | null = null;

  try {
    storeProducts = await db
      .select()
      .from(products)
      .where(eq(products.storeId, storeId))
      .orderBy(desc(products.createdAt));
  } catch (error) {
    dbError = error instanceof Error ? error : new Error("Failed to fetch store products");
    console.error("Error fetching store products:", error);
  }

  try {
    storeCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.storeId, storeId));
  } catch (error) {
    dbError = error instanceof Error ? error : new Error("Failed to fetch store categories");
    console.error("Error fetching store categories:", error);
  }

  return { products: storeProducts, categories: storeCategories, dbError };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const localhostAllowed = await isLocalhostRequest();
  if (!localhostAllowed) {
    return notFound();
  }

  const params = await searchParams;
  const selectedStoreId = params.store;

  const [merchantsResult, codesResult] = await Promise.all([
    getMerchantsData(),
    getActivationCodesData(),
  ]);

  const merchants = merchantsResult.merchants;
  const codes = codesResult.codes;
  const dbErrors = [
    merchantsResult.dbError,
    codesResult.dbError,
  ].filter(Boolean) as Error[];

  let storeDetails = null;
  if (selectedStoreId) {
    const storeDetailsResult = await getStoreDetails(selectedStoreId);
    storeDetails = {
      products: storeDetailsResult.products,
      categories: storeDetailsResult.categories,
    };
    if (storeDetailsResult.dbError) {
      dbErrors.push(storeDetailsResult.dbError);
    }
  }

  const hasDbError = dbErrors.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg font-mono text-sm">
        🔒 LOCALHOST ONLY ADMIN PANEL
      </div>

      {hasDbError && (
        <div className="fixed top-4 left-4 right-4 z-50 mx-4 bg-amber-600 text-white px-4 py-3 rounded-lg shadow-lg font-mono text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Database schema not synced or query failed. Some data may be missing.</span>
          </div>
          <details className="ml-4">
            <summary className="cursor-pointer underline hover:no-underline">Details</summary>
            <pre className="mt-2 text-xs bg-black/20 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap">
              {dbErrors.map((e, i) => `${i + 1}. ${e.message}`).join("\n")}
            </pre>
          </details>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Super Admin Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Localhost-only administration panel for StoreHub
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Localhost Access
              </span>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">All Merchants</h2>
              <div className="rounded-xl bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Merchant</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Store</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Products</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Joined</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {merchants.map((merchant) => (
                      <tr key={merchant.user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{merchant.user.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{merchant.user.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {merchant.store ? (
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">{merchant.store.name}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">/{merchant.store.slug}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">No store</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              merchant.plan === "pro"
                                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300"
                                : "bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {merchant.plan === "pro" ? "Pro" : "Free"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">
                          {merchant.productCount} {merchant.plan === "pro" ? " (∞)" : "/ 15"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                          {new Date(merchant.user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {merchant.store && (
                            <a
                              href={`/admin?store=${merchant.store.id}`}
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                            >
                              View Details
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Quick Stats</h2>
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Total Merchants</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">{merchants.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Pro Stores</dt>
                    <dd className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {merchants.filter((m) => m.plan === "pro").length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Free Stores</dt>
                    <dd className="font-semibold text-slate-600 dark:text-slate-300">
                      {merchants.filter((m) => m.plan === "free").length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Total Products</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">
                      {merchants.reduce((sum, m) => sum + m.productCount, 0)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Activation Codes</h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {codes.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No codes generated yet</p>
                  ) : (
                    codes.map((code) => (
                      <div
                        key={code.id}
                        className={`flex items-center justify-between gap-2 rounded-lg p-3 ${
                          code.isActive
                            ? code.timesUsed >= code.maxUses
                              ? "bg-amber-50 dark:bg-amber-900/30"
                              : "bg-emerald-50 dark:bg-emerald-900/30"
                            : "bg-slate-50 dark:bg-slate-700/30"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              {code.code}
                            </code>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                code.isActive
                                  ? code.timesUsed >= code.maxUses
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                              }`}
                            >
                              {code.isActive
                                ? code.timesUsed >= code.maxUses
                                  ? "USED"
                                  : "ACTIVE"
                                : "INACTIVE"}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span>Plan: {code.plan}</span>
                            <span>Uses: {code.timesUsed}/{code.maxUses}</span>
                            {(code.discount ?? 0) > 0 && <span>Discount: {code.discount}%</span>}
                            {code.expiresAt && (
                              <span>
                                Expires:{" "}
                                {new Date(code.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(code.code)}
                          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>

          {selectedStoreId && storeDetails && (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Store Details: {merchants.find((m) => m.store?.id === selectedStoreId)?.store?.name}
                </h2>
                <a
                  href="/admin"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  ← Back to all merchants
                </a>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                    Products ({storeDetails.products.length})
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {storeDetails.products.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No products</p>
                    ) : (
                      storeDetails.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {product.name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {product.price} EGP · Stock: {product.stock}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              product.isVisible
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                            }`}
                          >
                            {product.isVisible ? "Visible" : "Hidden"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                    Categories ({storeDetails.categories.length})
                  </h3>
                  <div className="space-y-2">
                    {storeDetails.categories.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No categories</p>
                    ) : (
                      storeDetails.categories.map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                        >
                          <p className="font-medium text-slate-900 dark:text-white">{category.name}</p>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(category.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="mt-8 rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Generate Activation Code</h2>
            <form
              action="/api/admin/generate-code"
              method="POST"
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Custom Code (optional)
                  </label>
                  <input
                    name="customCode"
                    type="text"
                    placeholder="Auto-generated if empty"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Plan
                  </label>
                  <select
                    name="plan"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="pro">Pro</option>
                    <option value="free">Free</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Price (EGP)
                  </label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    placeholder="299"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Discount (%)
                  </label>
                  <input
                    name="discount"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="0"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Max Uses
                  </label>
                  <input
                    name="maxUses"
                    type="number"
                    min="1"
                    defaultValue="1"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Duration (days, empty = lifetime)
                  </label>
                  <input
                    name="durationDays"
                    type="number"
                    min="1"
                    placeholder="30"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Generate Code
              </button>
            </form>
          </section>
        </div>
      </div>
  );
}

function notFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-lg text-slate-500">Admin panel is only accessible on localhost</p>
      </div>
    </div>
  );
}
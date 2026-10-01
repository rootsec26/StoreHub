"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Sparkles,
  Shield,
  Folder,
  CheckCircle,
  XCircle,
  Clipboard,
  Calendar,
  Flag,
  AlertTriangle,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

// ---- Risk heuristic types ----
type RiskLevel = "low" | "medium" | "high";

interface RiskHeuristics {
  phoneValid: boolean;
  addressComplete: boolean;
  duplicateFlag: boolean;
}

// Generate risk level from heuristics
function riskLevelFromHeuristics(h: RiskHeuristics): RiskLevel {
  if (!h.phoneValid || !h.addressComplete) return "high";
  if (h.duplicateFlag) return "medium";
  return "low";
}

// Risk badge colors and labels
const riskBadges: Record<RiskLevel, { label: string; className: string; emoji: string }> = {
  low: { label: "Low Risk", className: "bg-green-100 text-green-800", emoji: "🟢" },
  medium: { label: "Medium Risk", className: "bg-yellow-100 text-yellow-800", emoji: "🟡" },
  high: { label: "High Risk", className: "bg-red-100 text-red-800", emoji: "🔴" },
};

// ---- Tab 1: Abandoned Cart Recoverer ----

interface AbandonedCart {
  id: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string;
  createdAt: string;
}

function useAbandonedCarts(): { carts: AbandonedCart[]; loading: boolean } {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/orders");
        const data = await res.json();
        const allOrders = data.orders || [];

        // Filter pending orders as abandoned carts
        const pending = allOrders.filter((o: any) => o.status === "Pending");

        // Transform to abandoned cart format
        const carts = pending.map((o: any) => ({
          id: o.id,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          totalAmount: o.totalAmount,
          createdAt: o.createdAt,
        }));

        setCarts(carts);
      } catch (error) {
        console.error("Failed to load abandoned carts:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { carts, loading };
}

// ---- Tab 2: COD Risk Analyzer ----

interface CoderOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  totalAmount: string;
  createdAt: string;
  riskLevel: RiskLevel;
  heuristics: RiskHeuristics;
}

function useCODRiskAnalysis(): {
  orders: CoderOrder[];
  loading: boolean;
} {
  const [orders, setOrders] = useState<CoderOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/orders");
        const data = await res.json();
        const allOrders = data.orders || [];

        // Get pending COD orders
        const pending = allOrders.filter((o: any) => o.status === "Pending");

        // Analyze each order with heuristics
        const analyzed = pending.map((o: any) => {
          const phone = o.customerPhone || "";
          const address = o.customerAddress || "";

          // Heuristic rules:
          // 1. Phone validation: Egyptian numbers should start with 01 or +20/20
          const phoneValid = /^01\d{9}$/.test(phone.replace(/[^\d]/g, "")) ||
            /^201\d{9}$/.test(phone.replace(/[^\d]/g, ""));

          // 2. Address completeness: non-empty address
          const addressComplete = address.trim().length > 5;

          // 3. Duplicate order flag: check if same phone appears multiple times in pending
          const phoneDigits = phone.replace(/[^\d]/g, "");
          const duplicateFlag = allOrders.filter(
            (oa: any) =>
              oa.customerPhone?.replace(/[^\d]/g, "") === phoneDigits && oa.id !== o.id
          ).length > 0;

          const heuristics: RiskHeuristics = { phoneValid, addressComplete, duplicateFlag };
          const level = riskLevelFromHeuristics(heuristics);

          return {
            id: o.id,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            customerAddress: o.customerAddress,
            totalAmount: o.totalAmount,
            createdAt: o.createdAt,
            riskLevel: level,
            heuristics,
          };
        });

        setOrders(analyzed);
      } catch (error) {
        console.error("Failed to load COD risk analysis:", error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { orders, loading };
}

// ---- Main Component ----

export default function AIRadarPage() {
  const { t, formatMoney, formatDateTime } = useI18n();

  // Tab state
  const [activeTab, setActiveTab] = useState<"abandoned" | "cod-risk" | "ai-studio">(
    "abandoned"
  );

  // Summary stats (calculated from orders)
  const { carts: abandonedCarts, loading: abandonedLoading } = useAbandonedCarts();
  const { orders: codOrders, loading: codLoading } = useCODRiskAnalysis();

  // ---- Tab 3 state: AI Copywriting Studio ----
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [platform, setPlatform] = useState<"facebook" | "whatsapp" | "ad">(
    "facebook"
  );
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);

  // Fetch products (only while the studio tab is active)
  useEffect(() => {
    if (activeTab !== "ai-studio") return;

    async function loadProducts() {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        setProducts(data.products || []);
      } catch (error) {
        console.error("Failed to load products:", error);
      }
    }
    loadProducts();
  }, [activeTab]);

  const handleGenerate = useCallback(() => {
    if (!selectedProductId) return;
    setCopyLoading(true);

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    setTimeout(() => {
      let generatedText = "";

      switch (platform) {
        case "facebook": {
          // Facebook post template
          generatedText = `🎉 New Arrival Alert! 🎉

${product.name} is here to elevate your style! 🌟

💯 Quality you can trust
🚀 Fast delivery available

👉 Shop now and save 10% with code WELCOME10!

#NewProduct #${product.name.replace(/\s+/g, "").toLowerCase()} #StoreHub`;
          break;
        }
        case "whatsapp": {
          // WhatsApp promo template (Arabic + English)
          const arabicText = `🛍️ ${product.name} الآن متاح!\n\n💎 جودة عالية وسريعة التوصيل\n🎁 خصم خاص لأول طلب: 10% باستخدام كود WELCOME10\n\n👉 اطلب الآن واضغط على الرابط:\n`;
          const englishText = `🛍️ ${product.name} is now available!\n\n💎 High quality and fast delivery\n🎁 Special discount on first order: 10% with code WELCOME10\n\n👉 Shop now:\n`;
          generatedText = `${arabicText}${englishText}https://your-store.com/cart`;
          break;
        }
        case "ad": {
          // Ad headline template
          generatedText = `${product.name} - Premium Quality at Unbeatable Prices! 🔥\nLimited Stock Available - Shop Now Before It's Gone!\n#Sale #${product.name.replace(/\s+/g, "").toLowerCase()} #Deal`;
          break;
        }
      }

      setGeneratedText(generatedText);
      setCopyLoading(false);
    }, 500);
  }, [platform, products, selectedProductId]);

  // Copy to clipboard
  const handleCopyToClipboard = useCallback(() => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText).then(() => {
      // Clipboard copied successfully
    });
  }, [generatedText]);

  // Calculate summary values
  const abandonedCartsValue = abandonedCarts.reduce(
    (sum: number, o: AbandonedCart) => sum + (parseFloat(o.totalAmount) || 0),
    0
  ).toFixed(2);

  const highRiskCount = codOrders.filter((o) => o.riskLevel === "high").length;
  const codRiskAlertRate =
    codOrders.length > 0
      ? ((highRiskCount / codOrders.length) * 100).toFixed(1)
      : "0.0";

  const recoveredRevenue = (
    parseFloat(abandonedCartsValue) * 0.15
  ).toFixed(2); // Assume 15% recovery rate

  // ---- Tab 1: Abandoned Cart Recoverer ----
  if (activeTab === "abandoned") {
    if (abandonedLoading) {
      return <div className="p-6">Loading...</div>;
    }

    return (
      <div className="space-y-6">
        {/* Abandoned carts table */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 text-start">{t("table.customer")}</th>
                  <th className="px-6 py-4 text-start">{t("table.phone")}</th>
                  <th className="px-6 py-4 text-start">{t("table.amount")}</th>
                  <th className="px-6 py-4 text-start">{t("table.date")}</th>
                  <th className="px-6 py-4 text-start"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {abandonedCarts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      {t("orders.emptyTitle")}
                    </td>
                  </tr>
                ) : abandonedCarts.map((cart) => (
                  <tr key={cart.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {cart.customerName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                          {t("table.phone")}: {cart.customerPhone}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600" dir="ltr">
                      {cart.customerPhone || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {formatMoney(cart.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDateTime(cart.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                        onClick={() => {
                          const phoneDigits = normalizeWhatsAppNumber(cart.customerPhone);
                          if (!phoneDigits) return;
                          // Arabic message for WhatsApp offer
                          const arabicMessage = `🛒 عربة التسوق فارغة\nنشتاق لك! ارجع واستمتع بعرض خاص:\n`;
                          const recoveryLink = `https://your-store.com/cart/${cart.id}`;
                          const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                            arabicMessage + recoveryLink
                          )}`;
                          window.open(waUrl, "_blank");
                        }}
                      >
                        Send WhatsApp Offer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary info below table */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400 mb-2">
              {t("aiRadar.abandonedCartsValue")}
            </p>
            <p className="text-2xl font-bold text-white">{formatMoney(abandonedCartsValue)}</p>
          </div>
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400 mb-2">
              {t("aiRadar.recoveredRevenue")}
            </p>
            <p className="text-2xl font-bold text-indigo-400">
              {recoveredRevenue} EGP potentially recoverable
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Tab 2: COD Risk Analyzer ----
  if (activeTab === "cod-risk") {
    if (codLoading) {
      return <div className="p-6">Loading...</div>;
    }

    return (
      <div className="space-y-6">
        {/* Summary stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400 mb-2">
              {t("aiRadar.totalPendingCOD")}
            </p>
            <p className="text-2xl font-bold text-white">{codOrders.length}</p>
          </div>
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400 mb-2">
              {t("aiRadar.highRiskCount")}
            </p>
            <p className="text-2xl font-bold text-red-400">{highRiskCount}</p>
          </div>
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400 mb-2">
              {t("aiRadar.mediumRiskCount")}
            </p>
            <p className="text-2xl font-bold text-yellow-400">
              {codOrders.filter((o) => o.riskLevel === "medium").length}
            </p>
          </div>
        </div>

        {/* Orders table with risk badges */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 text-start">{t("table.customer")}</th>
                  <th className="px-6 py-4 text-start">{t("table.phone")}</th>
                  <th className="px-6 py-4 text-start">{t("table.address")}</th>
                  <th className="px-6 py-4 text-start">{t("table.amount")}</th>
                  <th className="px-6 py-4 text-start">{t("table.risk")}</th>
                  <th className="px-6 py-4 text-start">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {codOrders.map((order) => {
                  const badge = riskBadges[order.riskLevel];
                  const riskLabel =
                    order.heuristics.phoneValid && order.heuristics.addressComplete
                      ? "Phone & Address OK"
                      : order.heuristics.phoneValid
                        ? "Verify via WA"
                        : "Collect Deposit";

                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {order.customerName}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600" dir="ltr">
                        {order.customerPhone || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {order.customerAddress || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {formatMoney(order.totalAmount)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                          {badge.emoji} {badge.label}
                        </span>
                        {riskLabel && (
                          <p className="mt-1 text-xs text-slate-400">{riskLabel}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDateTime(order.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---- Tab 3: AI Copywriting Studio ----
  if (activeTab === "ai-studio") {
    return (
      <div className="space-y-6">
        {/* Product selector */}
        <div className="rounded-xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400 mb-4">
            {t("marketing.selectProduct")}
          </p>
          <select
            value={selectedProductId || ""}
            onChange={(e) =>
              setSelectedProductId(e.target.value || null)
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">{t("marketing.emptyTitle")}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>

{/* Platform selector */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div
            key="facebook"
            onClick={() => setPlatform("facebook")}
            className={`flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              platform === "facebook"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <p>{t("marketing.platform.facebook")}</p>
          </div>
          <div
            key="whatsapp"
            onClick={() => setPlatform("whatsapp")}
            className={`flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              platform === "whatsapp"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <p>{t("marketing.platform.whatsapp")}</p>
          </div>
          <div
            key="ad"
            onClick={() => setPlatform("ad")}
            className={`flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              platform === "ad"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <p>{t("marketing.platform.ad")}</p>
          </div>
        </div>

        {/* Generate button */}
        <div>
          <button
            onClick={handleGenerate}
            disabled={!selectedProductId || copyLoading}
            className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors ${
              copyLoading ? "bg-slate-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-500"}
            }`}
          >
            {copyLoading ? (
              <span>{t("ai.generating")}...</span>
            ) : (
              <span>{t("marketing.generate")}</span>
            )}
          </button>
        </div>

        {/* Generated copy area */}
        {generatedText && (
          <div className="mt-6 rounded-xl bg-slate-900 p-6">
            <p className="text-sm text-slate-400 mb-3">
              {t("marketing.output")}:
            </p>
            <div className="flex gap-2">
              <textarea
                readOnly
                value={generatedText}
                onFocus={handleCopyToClipboard}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white focus:border-indigo-500 focus:outline-none"
                placeholder="Copy to clipboard"
              />
              <button
                onClick={handleCopyToClipboard}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                {t("ai.copy")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
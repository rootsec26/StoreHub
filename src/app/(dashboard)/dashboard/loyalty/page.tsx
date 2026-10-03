"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Award, Loader2, Minus, Plus, Save } from "lucide-react";
import {
  DEFAULT_VIP_TIERS,
  type LoyaltyLedgerRow,
  type LoyaltySettingsRecord,
  type VipTierRecord,
} from "@/lib/loyalty";

interface LoyaltySummary {
  members: number;
  outstandingPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  enabled: boolean;
}

type TabId = "rules" | "tiers" | "ledger";

const DEFAULT_SETTINGS: LoyaltySettingsRecord = {
  id: "",
  storeId: "",
  pointsPerAmount: 10,
  redemptionRate: 10,
  signupBonusPoints: 100,
  isEnabled: true,
};

export default function LoyaltyPage() {
  const { t, formatMoney, formatNumber } = useI18n();
  const [settings, setSettings] = useState<LoyaltySettingsRecord>(DEFAULT_SETTINGS);
  const [tiers, setTiers] = useState<VipTierRecord[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedgerRow[]>([]);
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("rules");
  const [openModal, setOpenModal] = useState(false);
  const [modalType, setModalType] = useState<"add" | "deduct">("add");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [pointsToAdjust, setPointsToAdjust] = useState(0);
  const [adjustmentNote, setAdjustmentNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/loyalty", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.tiers)) setTiers(data.tiers);
      if (Array.isArray(data.ledger)) setLedger(data.ledger);
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      console.error("Failed to fetch loyalty data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Kick off the first load without blocking the initial paint.
    const initial = setTimeout(load, 0);
    const interval = setInterval(load, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/loyalty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "settings",
          pointsPerAmount: settings.pointsPerAmount,
          redemptionRate: settings.redemptionRate,
          signupBonusPoints: settings.signupBonusPoints,
          isEnabled: settings.isEnabled,
        }),
      });
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      await load();
    } catch (error) {
      console.error("Failed to save loyalty settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (tierId: string, patch: Partial<VipTierRecord>) => {
    setTiers((prev) =>
      prev.map((tier) => (tier.id === tierId ? { ...tier, ...patch } : tier))
    );
  };

  const saveTier = async (tier: VipTierRecord) => {
    if (!tier.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/loyalty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tier",
          id: tier.id,
          tierName: tier.tierName,
          minSpendThreshold: tier.minSpendThreshold,
          discountPercentage: tier.discountPercentage,
          freeShippingUnlocked: tier.freeShippingUnlocked,
          badgeColor: tier.badgeColor,
        }),
      });
      const data = await res.json();
      if (data.tier) {
        setTiers((prev) =>
          prev.map((row) => (row.id === data.tier.id ? data.tier : row))
        );
      }
      await load();
    } catch (error) {
      console.error("Failed to save VIP tier:", error);
    } finally {
      setSaving(false);
    }
  };

  const submitAdjustment = async () => {
    if (!selectedCustomer || pointsToAdjust <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer,
          action: modalType,
          points: Math.abs(pointsToAdjust),
          note: adjustmentNote,
        }),
      });
      const data = await res.json();
      if (data.success !== false) {
        setOpenModal(false);
        setSelectedCustomer(null);
        setPointsToAdjust(0);
        setAdjustmentNote("");
        await load();
      } else {
        console.error("Adjustment failed:", data.error);
      }
    } catch (error) {
      console.error("Failed to adjust loyalty points:", error);
    } finally {
      setSaving(false);
    }
  };

  const displayTiers: VipTierRecord[] =
    tiers.length > 0
      ? tiers
      : DEFAULT_VIP_TIERS.map((tier) => ({
          id: "",
          storeId: "",
          ...tier,
        }));

  const tabContent: Record<TabId, React.ReactNode> = {
    rules: (
      <div className="p-6">
        <h2 className="mb-6 text-xl font-bold text-slate-900">
          {t("loyalty.rulesTitle")}
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {t("loyalty.isEnabled")}
              </p>
              <p className="text-xs text-slate-500">
                {summary?.members ?? 0} {t("loyalty.sidebarMembers", { count: summary?.members ?? 0 })}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.isEnabled}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, isEnabled: e.target.checked }))
              }
              className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {t("loyalty.pointsPerAmount")}
            </label>
            <input
              type="number"
              value={settings.pointsPerAmount}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  pointsPerAmount: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              min="1"
              max="100000"
              step="0.1"
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("loyalty.pointsPerAmountDesc", {
                amount: settings.pointsPerAmount,
                currency: "EGP",
              })}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {t("loyalty.redemptionRate")}
            </label>
            <input
              type="number"
              value={settings.redemptionRate}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  redemptionRate: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              min="1"
              max="100000"
              step="1"
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("loyalty.redemptionRateDesc", {
                points: Math.floor(settings.redemptionRate),
                amount: 100,
                currency: "EGP",
              })}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {t("loyalty.signupBonus")}
            </label>
            <input
              type="number"
              value={settings.signupBonusPoints}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  signupBonusPoints: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              min="0"
              max="1000000"
              step="1"
            />
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("common.save")}
          </button>
        </div>
      </div>
    ),
    tiers: (
      <div className="p-6">
        <h2 className="mb-6 text-xl font-bold text-slate-900">
          {t("loyalty.vipTitle")}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {displayTiers.map((tier) => (
            <div
              key={tier.id || tier.tierName}
              className="rounded-xl bg-white p-6 shadow-sm transition-colors hover:bg-slate-50"
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ backgroundColor: tier.badgeColor }}
                >
                  {tier.tierName.slice(0, 1)}
                </span>
                <span className="font-semibold text-slate-900">
                  {tier.tierName}
                </span>
              </div>

              <label className="mb-3 block text-xs font-medium text-slate-500">
                {t("loyalty.minSpendThreshold")}
                <input
                  type="number"
                  value={tier.minSpendThreshold}
                  onChange={(e) =>
                    updateTier(tier.id, {
                      minSpendThreshold: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 py-2 ps-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  min="0"
                  step="100"
                />
              </label>

              <label className="mb-3 block text-xs font-medium text-slate-500">
                {t("loyalty.discountPercentage")}
                <input
                  type="number"
                  value={tier.discountPercentage}
                  onChange={(e) =>
                    updateTier(tier.id, {
                      discountPercentage: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 py-2 ps-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  min="0"
                  max="100"
                  step="1"
                />
              </label>

              <label className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={tier.freeShippingUnlocked}
                  onChange={(e) =>
                    updateTier(tier.id, {
                      freeShippingUnlocked: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {t("loyalty.freeShipping")}
              </label>

              <label className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-500">
                {t("loyalty.badgeColor")}
                <input
                  type="color"
                  value={tier.badgeColor}
                  onChange={(e) =>
                    updateTier(tier.id, { badgeColor: e.target.value })
                  }
                  className="h-8 w-10 cursor-pointer rounded border border-slate-300"
                />
              </label>

              <button
                onClick={() => saveTier(tier)}
                disabled={saving || !tier.id}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("common.save")}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-6">
          <h3 className="mb-4 text-lg font-medium text-indigo-700">
            {t("loyalty.addTier")}
          </h3>
          <p className="text-sm text-slate-500">
            Add new VIP tiers to your program.
          </p>
        </div>
      </div>
    ),
    ledger: (
      <div className="p-6">
        <h2 className="mb-6 text-xl font-bold text-slate-900">
          {t("loyalty.ledgerTitle")}
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 text-start">{t("loyalty.customer")}</th>
                <th className="px-6 py-4 text-start">
                  {t("loyalty.totalLifetimeSpend")}
                </th>
                <th className="px-6 py-4 text-start">
                  {t("loyalty.activeLoyaltyPoints")}
                </th>
                <th className="px-6 py-4 text-start">
                  {t("loyalty.currentVipTier")}
                </th>
                <th className="px-6 py-4 text-start">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    —
                  </td>
                </tr>
              )}
              {ledger.map((customer) => (
                <tr
                  key={customer.customerId}
                  className="border-b hover:bg-slate-50"
                >
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {customer.name || customer.email || customer.phone}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {formatMoney(customer.totalLifetimeSpend)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatNumber(customer.points)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{
                        backgroundColor: customer.tier?.badgeColor ?? "#94A3B8",
                      }}
                    >
                      {customer.tier?.tierName ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setSelectedCustomer(customer.customerId);
                        setModalType(customer.points > 0 ? "deduct" : "add");
                        setPointsToAdjust(1);
                        setAdjustmentNote("");
                        setOpenModal(true);
                      }}
                      className="text-xs text-emerald-600 underline hover:text-emerald-700"
                    >
                      {t("loyalty.adjustPoints")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {openModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
              <h2 className="mb-4 text-xl font-bold text-slate-900">
                {modalType === "add"
                  ? t("loyalty.addPoints")
                  : t("loyalty.deductPoints")}
              </h2>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAdjustment();
                }}
              >
                <input
                  type="hidden"
                  value={selectedCustomer ?? ""}
                  name="selectedCustomer"
                  readOnly
                />
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      {t("loyalty.customer")}
                    </label>
                    <p className="text-sm text-slate-500">
                      {selectedCustomer}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      {t("loyalty.pointsToAdjust")}
                    </label>
                    <input
                      type="number"
                      value={pointsToAdjust}
                      onChange={(e) =>
                        setPointsToAdjust(Math.abs(Number(e.target.value)))
                      }
                      className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      min="1"
                      max="1000000"
                      step="1"
                    />
                  </div>
                </div>

                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalType("add")}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      modalType === "add"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    {t("loyalty.addPoints")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalType("deduct")}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      modalType === "deduct"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Minus className="h-3 w-3" />
                    {t("loyalty.deductPoints")}
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("loyalty.note")}
                  </label>
                  <textarea
                    value={adjustmentNote}
                    onChange={(e) => setAdjustmentNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 py-2.5 ps-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter note..."
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving || pointsToAdjust <= 0}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {t("common.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenModal(false)}
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    ),
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl py-6 sm:py-12">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <Award className="h-5 w-5 text-indigo-600" />
          </span>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {t("nav.loyalty")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("loyalty.sidebarMembers", { count: summary?.members ?? 0 })}
            </p>
          </div>
        </div>

        <div className="mb-6 flex border-b border-slate-200">
          {(["rules", "tiers", "ledger"] as const).map((tab) => (
            <button
              key={tab}
              className={`rounded-t px-4 py-2 text-sm font-medium text-slate-600 transition-colors ${
                activeTab === tab
                  ? "bg-indigo-600 text-indigo-100"
                  : "hover:bg-slate-100"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "rules"
                ? t("loyalty.rulesTitle")
                : tab === "tiers"
                  ? t("loyalty.vipTitle")
                  : t("loyalty.ledgerTitle")}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  );
}

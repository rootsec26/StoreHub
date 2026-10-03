"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Tag,
  DollarSign,
  Calendar,
  Save,
} from "lucide-react";

import CopyCodeButton from "@/components/admin/CopyCodeButton";
import { ACTIVATION_CODE_SPECS, ACTIVATION_CODE_TYPES, type ActivationCodeType } from "@/lib/billing-packages";
import type {
  ActivationCodeDTO,
  ActivationCodeStatus,
} from "@/lib/activation-codes";

type StatusFilter = "all" | ActivationCodeStatus;

const STATUS_STYLES: Record<ActivationCodeStatus, string> = {
  available: "bg-emerald-100 text-emerald-700",
  used: "bg-slate-100 text-slate-600",
  expired: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<ActivationCodeStatus, string> = {
  available: "Available",
  used: "Used",
  expired: "Expired",
};

export default function CodesManager() {
  const [codes, setCodes] = useState<ActivationCodeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [type, setType] = useState<string>("PLAN_PRO");
  const [quantity, setQuantity] = useState(1);
  const [validDays, setValidDays] = useState(90);
  const [customCode, setCustomCode] = useState("");
  const [generating, setGenerating] = useState(false);

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  // Current time for promo expiration checks
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(() => Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Pricing management state
  const [pricing, setPricing] = useState<Record<string, { 
    basePrice: number; 
    promoPrice: number | null; 
    promoExpiresAt: string | null;
    nameAr: string | null;
    nameEn: string | null;
    isActive: boolean;
  }>>({});
  const [pricingLoading, setPricingLoading] = useState(true);
  const [savingPricing, setSavingPricing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/pricing")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.pricing) {
          const map: Record<string, {
            basePrice: number;
            promoPrice: number | null;
            promoExpiresAt: string | null;
            nameAr: string | null;
            nameEn: string | null;
            isActive: boolean;
          }> = {};
          for (const p of data.pricing) {
            map[p.type] = {
              basePrice: p.basePrice,
              promoPrice: p.promoPrice,
              promoExpiresAt: p.promoExpiresAt,
              nameAr: p.nameAr,
              nameEn: p.nameEn,
              isActive: p.isActive ?? true,
            };
          }
          setPricing(map);
        }
      })
      .catch(() => {
        // Silently fail, will use defaults
      })
      .finally(() => {
        if (!cancelled) setPricingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSavePricing(type: ActivationCodeType) {
    const current = pricing[type];
    if (!current) return;
    setSavingPricing(type);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          basePrice: current.basePrice,
          promoPrice: current.promoPrice,
          promoExpiresAt: current.promoExpiresAt,
          nameAr: current.nameAr,
          nameEn: current.nameEn,
          isActive: current.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save pricing");
      // Update local state with server response
      if (data.pricing) {
        setPricing((prev) => ({
          ...prev,
          [type]: {
            basePrice: data.pricing.basePrice,
            promoPrice: data.pricing.promoPrice,
            promoExpiresAt: data.pricing.promoExpiresAt,
            nameAr: data.pricing.nameAr,
            nameEn: data.pricing.nameEn,
            isActive: data.pricing.isActive,
          },
        }));
      }
    } catch (err) {
      console.error("Save pricing error:", err);
      setError("Failed to save pricing");
    } finally {
      setSavingPricing(null);
    }
  }

  function handlePricingChange(
    type: ActivationCodeType, 
    field: "basePrice" | "promoPrice" | "promoExpiresAt" | "nameAr" | "nameEn" | "isActive", 
    value: string | number | boolean | null
  ) {
    setPricing((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      },
    }));
  }

  const loadCodes = useCallback(() => {
    return fetch("/api/admin/codes")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data?.error || "Failed to load codes");
          return;
        }
        setCodes(data.codes ?? []);
        setError(null);
      })
      .catch(() => {
        setError("Failed to load codes");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/codes")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data?.error || "Failed to load codes");
          return;
        }
        setCodes(data.codes ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load codes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const counts = useMemo(() => {
    const base = { available: 0, used: 0, expired: 0 };
    for (const code of codes) base[code.status] += 1;
    return base;
  }, [codes]);

  const visibleCodes = useMemo(() => {
    const query = search.trim().toUpperCase();
    return codes.filter((code) => {
      if (filter !== "all" && code.status !== filter) return false;
      if (!query) return true;
      return (
        code.code.toUpperCase().includes(query) ||
        code.type.toUpperCase().includes(query)
      );
    });
  }, [codes, filter, search]);

  const availableCodes = useMemo(
    () => codes.filter((code) => code.status === "available").map((c) => c.code),
    [codes]
  );

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (generating) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          quantity,
          validDays,
          customCode: customCode.trim() ? customCode.trim() : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Failed to generate codes");
        return;
      }

      setToast(`${data.created} code(s) generated`);
      setCustomCode("");
      await loadCodes();
    } catch {
      setError("Failed to generate codes");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function copyAllAvailable() {
    if (availableCodes.length === 0) return;
    const ok = await copyText(availableCodes.join("\n"));
    if (ok) {
      setCopiedAll(true);
      setToast(`${availableCodes.length} code(s) copied`);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  }

  function shareOnWhatsApp(code: ActivationCodeDTO) {
    const message = `Your StoreHub activation code: ${code.code} (${code.label})`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  const specOptions = Object.values(ACTIVATION_CODE_SPECS);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="fixed top-4 right-4 z-50 bg-red-600 px-4 py-2 rounded-lg shadow-lg font-mono text-sm text-white">
        🔒 LOCALHOST ONLY ADMIN PANEL
      </div>

      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/admin"
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
            <h1 className="text-3xl font-bold">Activation Codes</h1>
            <p className="mt-1 text-sm text-slate-500">
              Generate plan, credit & add-on vouchers, then send them to merchants on WhatsApp after payment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadCodes();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Generator */}
        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Generate Codes</h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Product
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {specOptions.map((spec) => (
                    <option key={spec.type} value={spec.type}>
                      {spec.label} — {spec.price} EGP
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantity (batch)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Valid for (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Custom code (single only)
                </label>
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  maxLength={24}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Generate {quantity > 1 ? `${quantity} codes` : "code"}
            </button>
          </form>
        </section>

        {/* Inventory */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">All Codes</h2>
              <p className="text-sm text-slate-500">
                {counts.available} available · {counts.used} used ·{" "}
                {counts.expired} expired
              </p>
            </div>
            <button
              type="button"
              onClick={copyAllAvailable}
              disabled={availableCodes.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedAll ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy all available ({availableCodes.length})
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "available", "used", "expired"] as StatusFilter[]).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === value
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {value === "all" ? "All" : STATUS_LABELS[value]}
                </button>
              )
            )}

            <div className="relative ms-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or product"
                className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : visibleCodes.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No codes match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {["Code", "Product", "Status", "Expires", "Used", "Actions"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleCodes.map((code) => (
                    <tr key={code.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <code className="font-mono text-sm font-semibold">
                          {code.code}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {code.label}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[code.status]}`}
                        >
                          {STATUS_LABELS[code.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {code.expiresAt
                          ? new Date(code.expiresAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {code.usedAt
                          ? new Date(code.usedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <CopyCodeButton value={code.code} />
                          <button
                            type="button"
                            onClick={() => shareOnWhatsApp(code)}
                            title="Send on WhatsApp"
                            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Pricing & Promos Management */}
        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Tag className="h-5 w-5 text-indigo-600" />
            Manage Package Pricing & Limited-Time Promos
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Set base prices and optional promotional pricing for each activation code type.
            Promotional prices apply automatically when <code className="px-1.5 py-0.5 text-xs bg-slate-100 rounded font-mono">promo_expires_at</code> is in the future.
          </p>

          {pricingLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {["Product", "Type", "Name (AR)", "Name (EN)", "Active", "Base Price (EGP)", "Promo Price (EGP)", "Promo Expires At", "Status", "Actions"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ACTIVATION_CODE_TYPES.map((type) => {
                    const spec = ACTIVATION_CODE_SPECS[type];
                    const p = pricing[type] ?? {
                      basePrice: spec.price,
                      promoPrice: null,
                      promoExpiresAt: null,
                      nameAr: null,
                      nameEn: null,
                      isActive: true,
                    };
                    const isPromoActive =
                      p.promoPrice !== null &&
                      p.promoExpiresAt &&
                      new Date(p.promoExpiresAt).getTime() > currentTime;
                    const timeRemaining = isPromoActive
                      ? new Date(p.promoExpiresAt!).getTime() - currentTime
                      : 0;
                    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
                    const hoursRemaining = Math.ceil((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                    return (
                      <tr key={type} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                spec.kind === "plan"
                                  ? "bg-indigo-100 text-indigo-700"
                                  : spec.kind === "credit"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-violet-100 text-violet-700"
                              }`}
                            >
                              {spec.prefix}
                            </div>
                            <span className="font-medium text-slate-900">{spec.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              spec.kind === "plan"
                                ? "bg-indigo-50 text-indigo-600"
                                : spec.kind === "credit"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-violet-50 text-violet-600"
                            }`}
                          >
                            {spec.kind === "plan"
                              ? "Plan"
                              : spec.kind === "credit"
                              ? "Credit"
                              : "Add-on"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={p.nameAr ?? ""}
                            onChange={(e) => handlePricingChange(type, "nameAr", e.target.value || null)}
                            placeholder="Arabic name"
                            className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            dir="rtl"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={p.nameEn ?? ""}
                            onChange={(e) => handlePricingChange(type, "nameEn", e.target.value || null)}
                            placeholder="English name"
                            className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.isActive}
                              onChange={(e) => handlePricingChange(type, "isActive", e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">Active</span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={p.basePrice}
                            onChange={(e) => handlePricingChange(type, "basePrice", Number(e.target.value))}
                            className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={p.promoPrice ?? ""}
                            onChange={(e) => handlePricingChange(type, "promoPrice", e.target.value === "" ? null : Number(e.target.value))}
                            placeholder="Optional"
                            className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="datetime-local"
                            value={p.promoExpiresAt ? p.promoExpiresAt.slice(0, 16) : ""}
                            onChange={(e) => handlePricingChange(type, "promoExpiresAt", e.target.value || null)}
                            className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {isPromoActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                                <Check className="h-3 w-3" />
                                🔥 Active Promo
                                {daysRemaining > 0 ? (
                                  <> (Expires in {daysRemaining}d {hoursRemaining}h)</>
                                ) : (
                                  <> (Expires in {hoursRemaining}h)</>
                                )}
                              </span>
                            )}
                            {!isPromoActive && p.promoPrice !== null && p.promoExpiresAt && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-600">
                                Promo Expired
                              </span>
                            )}
                            {!p.promoPrice && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                                Standard Price
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleSavePricing(type)}
                            disabled={savingPricing === type}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingPricing === type ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            {savingPricing === type ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

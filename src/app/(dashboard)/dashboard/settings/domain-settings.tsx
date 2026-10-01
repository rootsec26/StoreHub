"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface DomainStatus {
  configured: boolean;
  domain: string | null;
  verified: boolean;
  status: "not_configured" | "pending_verification" | "active";
  verification?: Array<{
    type: "CNAME" | "A" | "TXT";
    domain: string;
    value: string;
    status: "pending" | "verified" | "failed";
    reason?: string;
  }>;
  mocked?: boolean;
}

type DomainStatusType = "not_configured" | "pending_verification" | "active";

interface DomainSettingsProps {
  storeSlug: string;
}

export default function DomainSettings({ storeSlug }: DomainSettingsProps) {
  const { t } = useI18n();

  const [domainStatus, setDomainStatus] = useState<DomainStatus>({
    configured: false,
    domain: null,
    verified: false,
    status: "not_configured",
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"verify" | "remove" | "add" | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchDomainStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stores/domain");
      const data = await res.json();
      if (res.ok) {
        setDomainStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch domain status:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const res = await fetch("/api/stores/domain");
        const data = await res.json();
        if (mounted && res.ok) {
          setDomainStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch domain status:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

    if (!domain) return;

    setActionLoading("add");
    try {
      const res = await fetch("/api/stores/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add domain");
      }

      showToast(data.message || t("domain.toast.added"), "success");
      setDomainInput("");
      fetchDomainStatus();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("domain.toast.addFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyDomain = async () => {
    if (!domainStatus.domain) return;

    setActionLoading("verify");
    try {
      const res = await fetch("/api/stores/domain", {
        method: "PATCH",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify domain");
      }

      if (data.verified) {
        showToast(data.message || t("domain.toast.verified"), "success");
      } else {
        showToast(data.message || t("domain.toast.notVerified"), "error");
      }
      fetchDomainStatus();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("domain.toast.verifyFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveDomain = async () => {
    if (!domainStatus.domain) return;

    if (!window.confirm(t("domain.confirmRemove"))) return;

    setActionLoading("remove");
    try {
      const res = await fetch("/api/stores/domain", {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove domain");
      }

      showToast(data.message || t("domain.toast.removed"), "success");
      fetchDomainStatus();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("domain.toast.removeFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t("domain.toast.copied"), "success");
  };

  const getStatusBadge = (status: DomainStatusType) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
            <CheckCircle className="h-3.5 w-3.5" />
            {t("domain.status.active")}
          </span>
        );
      case "pending_verification":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("domain.status.pending")}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            <Globe className="h-3.5 w-3.5" />
            {t("domain.status.notConfigured")}
          </span>
        );
    }
  };

  const getVerificationRows = () => {
    if (!domainStatus.verification || domainStatus.verification.length === 0) return null;

    return domainStatus.verification.map((record, index) => (
      <tr key={index} className="border-t border-slate-100">
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
              {record.type}
            </code>
            <span className="text-sm text-slate-600">{record.domain}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded break-all max-w-[200px]">
              {record.value}
            </code>
            <button
              onClick={() => copyToClipboard(record.value)}
              className="p-1.5 text-slate-400 hover:text-slate-600"
              aria-label={t("domain.copy")}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </td>
        <td className="py-3 px-4">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              record.status === "verified"
                ? "bg-emerald-100 text-emerald-800"
                : record.status === "failed"
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {record.status === "verified" && <CheckCircle className="h-3 w-3" />}
            {record.status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
            {record.status === "failed" && <AlertCircle className="h-3 w-3" />}
            {t(`domain.verification.${record.status}` as TranslationKey)}
          </span>
        </td>
      </tr>
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed end-4 top-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg flex items-center gap-2 ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Globe className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("domain.title")}
              </h3>
              <p className="text-sm text-slate-500">{t("domain.subtitle")}</p>
            </div>
          </div>
          {domainStatus.mocked && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {t("domain.mockMode")}
            </span>
          )}
        </div>

        {domainStatus.configured ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{t("domain.currentDomain")}</p>
                <p className="font-mono text-lg font-medium text-slate-900">
                  https://{domainStatus.domain}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(domainStatus.status)}
              </div>
            </div>

            {domainStatus.verification && domainStatus.verification.length > 0 && (
              <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="mb-3 font-medium text-slate-900">
                  {t("domain.dnsRecords")}
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        <th className="pb-2 px-4">{t("domain.dns.type")}</th>
                        <th className="pb-2 px-4">{t("domain.dns.name")}</th>
                        <th className="pb-2 px-4">{t("domain.dns.value")}</th>
                        <th className="pb-2 px-4">{t("domain.dns.status")}</th>
                      </tr>
                    </thead>
                    <tbody>{getVerificationRows()}</tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleVerifyDomain}
                disabled={actionLoading === "verify" || domainStatus.verified}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === "verify" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {domainStatus.verified
                  ? t("domain.verified")
                  : t("domain.verifyNow")}
              </button>

              <button
                onClick={handleRemoveDomain}
                disabled={actionLoading === "remove"}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === "remove" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("domain.remove")}
              </button>

              <a
                href={`https://${domainStatus.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                {t("domain.visitStore")}
              </a>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("domain.inputLabel")}
                </label>
                <div className="relative">
                  <Globe className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder={t("domain.inputPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={actionLoading === "add"}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">{t("domain.inputHint")}</p>
              </div>

              <button
                type="submit"
                disabled={actionLoading === "add" || !domainInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === "add" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                {actionLoading === "add" ? t("common.saving") : t("domain.add")}
              </button>

            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <AlertCircle className="h-4 w-4" />
              {showInstructions ? t("domain.hideInstructions") : t("domain.showInstructions")}
            </button>

            {showInstructions && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="mb-3 font-medium text-slate-900">{t("domain.dnsInstructions")}</h4>
                <div className="space-y-3 text-sm">
                  <div className="rounded bg-white p-3">
                    <p className="mb-1 font-medium text-slate-900">{t("domain.dns.cname")}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">{t("domain.dns.name")}: </span>
                        <code className="font-mono text-slate-900">@</code> <span className="text-slate-500">or</span> <code className="font-mono text-slate-900">www</code>
                      </div>
                      <div>
                        <span className="text-slate-500">{t("domain.dns.value")}: </span>
                        <code className="font-mono text-slate-900">cname.vercel-dns.com</code>
                      </div>
                    </div>
                  </div>
                  <div className="rounded bg-white p-3">
                    <p className="mb-1 font-medium text-slate-900">{t("domain.dns.aRecord")}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">{t("domain.dns.name")}: </span>
                        <code className="font-mono text-slate-900">@</code>
                      </div>
                      <div>
                        <span className="text-slate-500">{t("domain.dns.value")}: </span>
                        <code className="font-mono text-slate-900">76.76.21.21</code>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t("domain.dns.note")}
                  </p>
                </div>
              </div>
)}
        </form>
        </>
        )}
      </div>
    </div>
  );
}
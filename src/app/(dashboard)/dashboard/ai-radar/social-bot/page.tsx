"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Check,
  CircleQuestionMark,
  Copy,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  UserCheck,
} from "lucide-react";

import SocialBotSetupBanner from "@/components/dashboard/SocialBotSetupBanner";
import SocialChannelHelpModal from "@/components/dashboard/SocialChannelHelpModal";
import { useI18n } from "@/lib/i18n";

/**
 * AI Sales Representative setup: channel connections, persona tuning,
 * auto-comment replies and live chat inspection with manual takeover.
 */

type SocialPlatform = "FACEBOOK" | "INSTAGRAM" | "WHATSAPP";
type Tone = "friendly" | "formal" | "professional";
type SessionStatus = "ACTIVE" | "ORDER_CREATED" | "HANDED_TO_HUMAN";

const PLATFORMS: SocialPlatform[] = ["FACEBOOK", "INSTAGRAM", "WHATSAPP"];

const PLATFORM_BADGE: Record<SocialPlatform, { label: string; className: string }> = {
  FACEBOOK: { label: "f", className: "bg-[#1877F2] text-white" },
  INSTAGRAM: { label: "ig", className: "bg-gradient-to-br from-[#F58529] to-[#DD2A7B] text-white" },
  WHATSAPP: { label: "wa", className: "bg-[#25D366] text-white" },
};

const TONE_PROMPTS: Record<Tone, string> = {
  friendly: "النبرة: ودودة ومرحبة باللهجة المصرية العامية.",
  formal: "النبرة: رسمية ومباشرة باللغة العربية الفصحى.",
  professional: "النبرة: احترافية واستشارية متزنة.",
};

const STATUS_BADGE: Record<SessionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  ORDER_CREATED: "bg-indigo-100 text-indigo-800",
  HANDED_TO_HUMAN: "bg-amber-100 text-amber-800",
};

interface Channel {
  id: string;
  platform: SocialPlatform;
  pageIdMasked: string;
  accessTokenMasked: string;
  isConnected: boolean;
  isAutoReplyEnabled: boolean;
  aiPersonaPrompt: string;
  webhookUrl: string;
}

interface SessionSummary {
  id: string;
  platform: SocialPlatform;
  customerPhoneOrPsid: string;
  customerName: string;
  status: SessionStatus;
  orderId: string | null;
  preview: string;
  messageCount: number;
  updatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at?: string;
}

interface ExtractedItem {
  productId?: string;
  name: string;
  size?: string;
  quantity: number;
  unitPrice?: number;
}

interface SessionDetail {
  id: string;
  platform: SocialPlatform;
  customerPhoneOrPsid: string;
  customerName: string;
  status: SessionStatus;
  orderId: string | null;
  conversationHistory: ChatMessage[];
  extractedOrderData: {
    items: ExtractedItem[];
    address: string;
    phone: string;
    name: string;
    governorate?: string;
  };
  updatedAt: string;
}

export default function SocialBotSetupPage() {
  const { t, formatDateTime } = useI18n();

  // ---- channels ----------------------------------------------------------
  const [channels, setChannels] = useState<Channel[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [forms, setForms] = useState<
    Record<SocialPlatform, { pageId: string; accessToken: string; open: boolean }>
  >({
    FACEBOOK: { pageId: "", accessToken: "", open: false },
    INSTAGRAM: { pageId: "", accessToken: "", open: false },
    WHATSAPP: { pageId: "", accessToken: "", open: false },
  });
  const [channelBusy, setChannelBusy] = useState<SocialPlatform | null>(null);
  const [helpPlatform, setHelpPlatform] = useState<SocialPlatform | null>(null);
  const connectionsRef = useRef<HTMLElement | null>(null);

  // ---- persona -----------------------------------------------------------
  const [tone, setTone] = useState<Tone>("friendly");
  const [customPrompt, setCustomPrompt] = useState("");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaSaved, setPersonaSaved] = useState(false);

  // ---- live chat ---------------------------------------------------------
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [summary, setSummary] = useState({ active: 0, orderCreated: 0, handedOver: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // -------------------------------------------------------------------------
  // Loaders
  // -------------------------------------------------------------------------
  const applyStoredPersona = useCallback((stored: string) => {
    const friendly = TONE_PROMPTS.friendly;
    const formal = TONE_PROMPTS.formal;
    const professional = TONE_PROMPTS.professional;

    let toneMatch: Tone | null = null;
    if (stored.startsWith(formal)) toneMatch = "formal";
    else if (stored.startsWith(professional)) toneMatch = "professional";
    else if (stored.startsWith(friendly)) toneMatch = "friendly";

    if (toneMatch) setTone(toneMatch);
    setCustomPrompt(
      toneMatch ? stored.slice(TONE_PROMPTS[toneMatch].length).trim() : stored.trim()
    );
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/social/channels", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setChannels(data.channels || []);
      if (typeof data.webhookUrl === "string") setWebhookUrl(data.webhookUrl);

      const first = (data.channels || []).find(
        (channel: Channel) => channel.isConnected
      );
      if (first && typeof first.aiPersonaPrompt === "string") {
        applyStoredPersona(first.aiPersonaPrompt);
      }
    } catch (error) {
      console.error("Failed to load social channels:", error);
    }
  }, [applyStoredPersona]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/social/sessions", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.summary) setSummary(data.summary);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/social/sessions?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setDetail(data.session || null);
    } catch (error) {
      console.error("Failed to load session detail:", error);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first paint never blocks on the two round trips and the
    // react-hooks/set-state-in-effect rule stays happy.
    const timer = setTimeout(() => {
      loadChannels();
      loadSessions();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadChannels, loadSessions]);

  // Light polling so the inspection panel feels live.
  useEffect(() => {
    const timer = setInterval(() => {
      loadSessions();
      if (selectedId) loadDetail(selectedId);
    }, 20000);
    return () => clearInterval(timer);
  }, [loadSessions, loadDetail, selectedId]);

  // -------------------------------------------------------------------------
  // Channel actions
  // -------------------------------------------------------------------------
  const saveChannel = useCallback(
    async (platform: SocialPlatform, body: Record<string, unknown>) => {
      setChannelBusy(platform);
      try {
        const res = await fetch("/api/social/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, ...body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setChannels(data.channels || []);
        setForms((prev) => ({
          ...prev,
          [platform]: { pageId: "", accessToken: "", open: false },
        }));
        return true;
      } catch (error) {
        console.error("Channel save failed:", error);
        return false;
      } finally {
        setChannelBusy(null);
      }
    },
    []
  );

  const toggleAutoReply = useCallback(
    async (channel: Channel) => {
      setChannelBusy(channel.platform);
      try {
        const res = await fetch("/api/social/channels", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: channel.platform,
            isAutoReplyEnabled: !channel.isAutoReplyEnabled,
          }),
        });
        const data = await res.json();
        if (res.ok) setChannels(data.channels || []);
      } catch (error) {
        console.error("Auto-reply toggle failed:", error);
      } finally {
        setChannelBusy(null);
      }
    },
    []
  );

  const disconnect = useCallback(async (platform: SocialPlatform) => {
    setChannelBusy(platform);
    try {
      const res = await fetch(`/api/social/channels?platform=${platform}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) setChannels(data.channels || []);
    } catch (error) {
      console.error("Disconnect failed:", error);
    } finally {
      setChannelBusy(null);
    }
  }, []);

  const savePersona = useCallback(async () => {
    setPersonaSaving(true);
    setPersonaSaved(false);
    const persona = `${TONE_PROMPTS[tone]}${customPrompt.trim() ? `\n${customPrompt.trim()}` : ""}`;
    try {
      const res = await fetch("/api/social/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiPersonaPrompt: persona }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setChannels(data.channels || []);
      setPersonaSaved(true);
      setTimeout(() => setPersonaSaved(false), 2500);
    } catch (error) {
      console.error("Persona save failed:", error);
    } finally {
      setPersonaSaving(false);
    }
  }, [tone, customPrompt]);

  // -------------------------------------------------------------------------
  // Live chat actions
  // -------------------------------------------------------------------------
  const selectSession = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setReplyText("");
      await loadDetail(id);
    },
    [loadDetail]
  );

  const patchSession = useCallback(
    async (body: Record<string, unknown>) => {
      setChatBusy(true);
      try {
        const res = await fetch("/api/social/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        if (data.session?.id) setDetail(data.session);
        await loadSessions();
        if (data.session?.id) await loadDetail(data.session.id);
        setReplyText("");
      } catch (error) {
        console.error("Session update failed:", error);
      } finally {
        setChatBusy(false);
      }
    },
    [loadSessions, loadDetail]
  );

  const copyWebhook = useCallback(() => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [webhookUrl]);

  const channelFor = useCallback(
    (platform: SocialPlatform) =>
      channels.find((channel) => channel.platform === platform) ?? null,
    [channels]
  );

  const connectedCount = channels.filter((channel) => channel.isConnected).length;
  const autoReplyCount = channels.filter(
    (channel) => channel.isConnected && channel.isAutoReplyEnabled
  ).length;

  const scrollToConnections = useCallback(() => {
    connectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const startSetup = useCallback(() => {
    const pending =
      PLATFORMS.find((platform) => !channelFor(platform)?.isConnected) ?? "FACEBOOK";
    setForms((prev) => ({ ...prev, [pending]: { ...prev[pending], open: true } }));
    scrollToConnections();
  }, [channelFor, scrollToConnections]);

  const closeHelp = useCallback(() => setHelpPlatform(null), []);

  const extracted = detail?.extractedOrderData;
  const extractedTotal = useMemo(() => {
    if (!extracted) return 0;
    return extracted.items.reduce(
      (sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 1),
      0
    );
  }, [extracted]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/ai-radar"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("socialBot.backToRadar")}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Bot className="h-6 w-6 text-indigo-600" />
            {t("socialBot.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("socialBot.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("socialBot.webhookUrl")}
          </span>
          <code className="max-w-[260px] truncate text-xs text-slate-700" dir="ltr">
            {webhookUrl || "…"}
          </code>
          <button
            type="button"
            onClick={copyWebhook}
            className="rounded p-1 text-slate-500 hover:bg-slate-200"
            aria-label={t("socialBot.webhookUrl")}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------
          0. 3-minute setup stepper
      --------------------------------------------------------------- */}
      <SocialBotSetupBanner
        connectedCount={connectedCount}
        autoReplyCount={autoReplyCount}
        onStart={startSetup}
        onShowAutoReply={scrollToConnections}
      />

      {/* ---------------------------------------------------------------
          1. Connection cards
      --------------------------------------------------------------- */}
      <section ref={connectionsRef} className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("socialBot.connections")}
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const channel = channelFor(platform);
            const form = forms[platform];
            const busy = channelBusy === platform;

            return (
              <div
                key={platform}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${PLATFORM_BADGE[platform].className}`}
                  >
                    {PLATFORM_BADGE[platform].label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {t(`socialBot.platform.${platform}`)}
                    </p>
                    <span
                      className={`mt-1 inline-flex max-w-full items-start gap-1 rounded-full px-2 py-0.5 text-start text-[10px] font-medium leading-snug ${
                        channel?.isConnected && channel.isAutoReplyEnabled
                          ? "bg-emerald-100 text-emerald-800"
                          : channel?.isConnected
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {channel?.isConnected
                        ? channel.isAutoReplyEnabled
                          ? t("socialBot.liveBadge")
                          : t("socialBot.autoReplyOffBadge")
                        : t("socialBot.notConnected")}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHelpPlatform(platform)}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <CircleQuestionMark className="h-3.5 w-3.5" />
                  {t("socialBot.help.link")}
                </button>

                {channel?.isConnected ? (
                  <>
                    <div className="space-y-1 text-xs text-slate-500">
                      <p dir="ltr" className="text-start">
                        {t("socialBot.pageId")}: {channel.pageIdMasked || "—"}
                      </p>
                      <p dir="ltr" className="text-start">
                        {t("socialBot.accessToken")}: {channel.accessTokenMasked || "—"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleAutoReply(channel)}
                      disabled={busy}
                      aria-pressed={channel.isAutoReplyEnabled}
                      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                        channel.isAutoReplyEnabled
                          ? "bg-indigo-600 text-white hover:bg-indigo-500"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <span className="text-start">{t("socialBot.autoReply")}</span>
                      <span
                        className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                          channel.isAutoReplyEnabled ? "bg-white/30" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                            channel.isAutoReplyEnabled ? "translate-x-3" : "translate-x-0"
                          }`}
                        />
                      </span>
                    </button>

                    <p className="text-[11px] leading-snug text-slate-400">
                      {t("socialBot.autoReplyHint")}
                    </p>

                    <button
                      type="button"
                      onClick={() => disconnect(platform)}
                      disabled={busy}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t("socialBot.disconnect")}
                    </button>
                  </>
                ) : form.open ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      dir="ltr"
                      placeholder={t("socialBot.pageId")}
                      value={form.pageId}
                      onChange={(e) =>
                        setForms((prev) => ({
                          ...prev,
                          [platform]: { ...prev[platform], pageId: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="password"
                      dir="ltr"
                      placeholder={t("socialBot.accessToken")}
                      value={form.accessToken}
                      onChange={(e) =>
                        setForms((prev) => ({
                          ...prev,
                          [platform]: { ...prev[platform], accessToken: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !form.pageId || !form.accessToken}
                        onClick={() =>
                          saveChannel(platform, {
                            pageId: form.pageId,
                            accessToken: form.accessToken,
                          })
                        }
                        className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {busy ? t("socialBot.connecting") : t("socialBot.connect")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForms((prev) => ({
                            ...prev,
                            [platform]: { ...prev[platform], open: false },
                          }))
                        }
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setForms((prev) => ({ ...prev, [platform]: { ...prev[platform], open: true } }))
                    }
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    {t("socialBot.connectCta", {
                      platform: t(`socialBot.platform.${platform}`),
                    })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          2. Persona tuning
      --------------------------------------------------------------- */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("socialBot.persona")}
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["friendly", t("socialBot.toneFriendly")],
              ["formal", t("socialBot.toneFormal")],
              ["professional", t("socialBot.toneProfessional")],
            ] as [Tone, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTone(value)}
              aria-pressed={tone === value}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                tone === value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={t("socialBot.personaPlaceholder")}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={savePersona}
            disabled={personaSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {personaSaving ? t("socialBot.saving") : t("socialBot.savePersona")}
          </button>
          {personaSaved && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> {t("socialBot.saved")}
            </span>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------
          3. Live chat inspection
      --------------------------------------------------------------- */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("socialBot.liveChat")}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {t("socialBot.sessionsCount", { count: sessions.length })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              loadSessions();
              if (selectedId) loadDetail(selectedId);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("socialBot.refresh")}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Session list */}
          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-slate-200">
            {sessions.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bot className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {t("socialBot.noSessions")}
                </p>
                <p className="mt-1 text-xs text-slate-400">{t("socialBot.noSessionsHint")}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => selectSession(session.id)}
                      className={`w-full px-4 py-3 text-start transition-colors ${
                        selectedId === session.id ? "bg-indigo-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {session.customerName || session.customerPhoneOrPsid}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_BADGE[session.status]
                          }`}
                        >
                          {t(`socialBot.status.${session.status}`)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {session.preview || "—"}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {session.platform} · {formatDateTime(session.updatedAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Conversation viewer */}
          <div className="flex min-h-[420px] flex-col rounded-lg border border-slate-200">
            {!detail ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">
                {t("socialBot.selectSession")}
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {detail.customerName || detail.customerPhoneOrPsid}
                    </p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {detail.platform} · {detail.customerPhoneOrPsid}
                      {detail.orderId ? ` · ${t("socialBot.orderId")}: ${detail.orderId.slice(0, 8)}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                        STATUS_BADGE[detail.status]
                      }`}
                    >
                      {t(`socialBot.status.${detail.status}`)}
                    </span>

                    {detail.status === "HANDED_TO_HUMAN" ? (
                      <button
                        type="button"
                        disabled={chatBusy}
                        onClick={() =>
                          patchSession({ id: detail.id, status: "ACTIVE" })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <Bot className="h-3.5 w-3.5" />
                        {t("socialBot.resumeAi")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={chatBusy}
                        onClick={() =>
                          patchSession({ id: detail.id, status: "HANDED_TO_HUMAN" })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-400 disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {t("socialBot.takeOver")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" style={{ maxHeight: 340 }}>
                  {(detail.conversationHistory ?? []).map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                          message.role === "user"
                            ? "rounded-bl-sm bg-slate-100 text-slate-800"
                            : "rounded-br-sm bg-indigo-600 text-white"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Extracted order data */}
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {t("socialBot.extracted")}
                  </p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-700">
                    <span>
                      {t("table.name")}: {extracted?.name || "—"}
                    </span>
                    <span dir="ltr">
                      {t("table.phone")}: {extracted?.phone || "—"}
                    </span>
                    <span>
                      {t("table.address")}:
                      {" "}
                      {[extracted?.address, extracted?.governorate].filter(Boolean).join("، ") || "—"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-700">
                    {t("socialBot.items")}:
                    {extracted && extracted.items.length > 0 ? (
                      <span>
                        {" "}
                        {extracted.items
                          .map(
                            (item) =>
                              `${item.quantity}× ${item.name}${item.size ? ` (${item.size})` : ""}`
                          )
                          .join("، ")}
                        {extractedTotal > 0 ? ` — ${extractedTotal.toFixed(2)}` : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400"> {t("socialBot.noItems")}</span>
                    )}
                  </div>
                </div>

                {/* Manual reply */}
                <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && replyText.trim() && !chatBusy) {
                        patchSession({ id: detail.id, reply: replyText.trim() });
                      }
                    }}
                    placeholder={t("socialBot.replyPlaceholder")}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={chatBusy || !replyText.trim()}
                    onClick={() =>
                      patchSession({ id: detail.id, reply: replyText.trim() })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {t("socialBot.send")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          4. Per-channel connection help
      --------------------------------------------------------------- */}
      <SocialChannelHelpModal
        platform={helpPlatform}
        webhookUrl={webhookUrl}
        onClose={closeHelp}
      />
    </div>
  );
}

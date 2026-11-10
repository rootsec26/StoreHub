"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  Megaphone,
  Plus,
  Trash2,
  EyeOff,
  Eye,
} from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input, Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import {
  MAX_BANNER_DURATION_HOURS,
  MAX_BANNER_MESSAGE_LENGTH,
  type PlatformBroadcastDTO,
} from "@/lib/platform-banner-types";

const DURATION_PRESETS = [
  { label: "2 hours", hours: 2 },
  { label: "24 hours", hours: 24 },
  { label: "72 hours", hours: 72 },
  { label: "7 days", hours: 24 * 7 },
];

type BannerStatus = "live" | "expired" | "unpublished";

function statusOf(broadcast: PlatformBroadcastDTO): BannerStatus {
  if (!broadcast.isActive) return "unpublished";
  return new Date(broadcast.expiresAt).getTime() > Date.now()
    ? "live"
    : "expired";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  return `${hours}h ${minutes}m left`;
}

export default function BannerManager() {
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcastDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-banner", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load banners");
      const data = (await res.json()) as { broadcasts?: PlatformBroadcastDTO[] };
      setBroadcasts(data.broadcasts ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load banners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const live = useMemo(
    () => broadcasts.find((broadcast) => statusOf(broadcast) === "live") ?? null,
    [broadcasts]
  );

  async function patchBroadcast(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/platform-banner/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Update failed");
      setToast({
        message: isActive ? "Banner published" : "Banner unpublished",
        tone: "success",
      });
      await load();
    } catch {
      setToast({ message: "Failed to update banner", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBroadcast(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/platform-banner/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setToast({ message: "Banner deleted", tone: "success" });
      await load();
    } catch {
      setToast({ message: "Failed to delete banner", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Site banner
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Global announcement bar shown at the top of the platform for every
            visitor. It disappears automatically at expiry.
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4" />
          New banner
        </Button>
      </section>

      {/* Currently live banner */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Currently live
          </h2>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : live ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {live.message}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                Expires {formatDate(live.expiresAt)} · {formatCountdown(live.expiresAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="emerald">Live</Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === live.id}
                onClick={() => void patchBroadcast(live.id, false)}
              >
                <EyeOff className="h-4 w-4" />
                Unpublish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === live.id}
                onClick={() => void deleteBroadcast(live.id)}
                className="text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No banner is live right now.
          </p>
        )}
      </section>

      {/* History */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ms-auto h-4 w-20" />
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
        ) : broadcasts.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No banners yet"
            description="Publish a site-wide announcement that visitors see at the top of every page."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  {["Message", "Expires", "Created", "Status", ""].map((header) => (
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
                {broadcasts.map((broadcast) => {
                  const status = statusOf(broadcast);
                  return (
                    <tr key={broadcast.id}>
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {broadcast.message}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDate(broadcast.expiresAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDate(broadcast.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            status === "live"
                              ? "emerald"
                              : status === "expired"
                                ? "slate"
                                : "amber"
                          }
                        >
                          {status === "live"
                            ? "Live"
                            : status === "expired"
                              ? "Expired"
                              : "Unpublished"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {status !== "live" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === broadcast.id}
                              onClick={() =>
                                void patchBroadcast(broadcast.id, true)
                              }
                            >
                              <Eye className="h-4 w-4" />
                              Publish
                            </Button>
                          )}
                          {status === "live" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === broadcast.id}
                              onClick={() =>
                                void patchBroadcast(broadcast.id, false)
                              }
                            >
                              <EyeOff className="h-4 w-4" />
                              Unpublish
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === broadcast.id}
                            onClick={() => void deleteBroadcast(broadcast.id)}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BannerComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false);
          setToast({ message: "Banner published", tone: "success" });
          void load();
        }}
      />

      {toast && (
        <div
          className={cn(
            "fixed bottom-4 end-4 z-[90] flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg",
            toast.tone === "success" ? "bg-emerald-600" : "bg-rose-600"
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function BannerComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [message, setMessage] = useState("");
  const [hours, setHours] = useState("24");
  const [expiryPreview, setExpiryPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage("");
    setHours("24");
    setExpiryPreview(null);
    setError(null);
  }, [open]);

  const numericHours = Number(hours);

  function updateHours(value: string) {
    setHours(value);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setExpiryPreview(null);
      return;
    }
    const date = new Date(Date.now() + parsed * 3_600_000);
    setExpiryPreview(
      date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  async function submit() {
    if (!message.trim()) {
      setError("Message is required");
      return;
    }
    if (!Number.isFinite(numericHours) || numericHours <= 0) {
      setError("Enter a duration in hours greater than 0");
      return;
    }
    if (numericHours > MAX_BANNER_DURATION_HOURS) {
      setError(`Duration is capped at ${MAX_BANNER_DURATION_HOURS} hours`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          expiresInHours: numericHours,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { broadcast?: PlatformBroadcastDTO; error?: string }
        | null;
      if (!res.ok || !payload?.broadcast) {
        throw new Error(payload?.error ?? "Failed to publish banner");
      }
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to publish banner"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New site banner"
      description="Shown at the top of every page until it expires or is unpublished."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            {!submitting && <Megaphone className="h-4 w-4" />}
            Publish banner
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea
          label="Message"
          value={message}
          maxLength={MAX_BANNER_MESSAGE_LENGTH + 100}
          onChange={(event) => setMessage(event.target.value)}
          disabled={submitting}
          placeholder="e.g. StoreHub 2.0 is live — create your store in minutes"
        />
        <p
          className={cn(
            "text-end text-xs",
            message.length > MAX_BANNER_MESSAGE_LENGTH
              ? "text-rose-600"
              : "text-slate-400"
          )}
        >
          {message.length.toLocaleString("en-US")} /{" "}
          {MAX_BANNER_MESSAGE_LENGTH.toLocaleString("en-US")}
        </p>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Duration (hours)
          </p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.hours}
                type="button"
                onClick={() => updateHours(String(preset.hours))}
                disabled={submitting}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  Number(hours) === preset.hours
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Input
              type="number"
              min={1}
              max={MAX_BANNER_DURATION_HOURS}
              step={1}
              value={hours}
              onChange={(event) => updateHours(event.target.value)}
              disabled={submitting}
              hint={
                expiryPreview
                  ? `Banner will expire on ${expiryPreview}`
                  : "Enter a whole number of hours"
              }
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

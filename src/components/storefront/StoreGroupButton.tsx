"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock, MessageSquare, UserPlus, Users } from "lucide-react";

import { useI18n } from "@/lib/i18n";

const FOLLOWER_ID_KEY = "storehub:follower-id";

type Membership = "none" | "pending" | "approved" | "rejected";

function getOrCreateFollowerId(): string | null {
  try {
    const existing = window.localStorage.getItem(FOLLOWER_ID_KEY);
    if (existing) return existing;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(FOLLOWER_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Store-group entry button for the storefront header. Reflects the viewer's
 * membership: join request → pending review → vibrant "enter community"
 * state once approved. Signed-in users resolve via session; anonymous
 * shoppers via the shared localStorage follower id.
 */
export default function StoreGroupButton({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [membership, setMembership] = useState<Membership | null>(null);
  const followerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    followerIdRef.current = getOrCreateFollowerId();

    const params = new URLSearchParams({ slug });
    if (followerIdRef.current) params.set("followerId", followerIdRef.current);
    fetch(`/api/storefront/group?${params.toString()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { membership?: Membership; group?: unknown } | null) => {
        if (cancelled || !data) return;
        // No group configured → hide the button entirely.
        if (!data.group) {
          setMembership("none");
          return;
        }
        setMembership(data.membership ?? "none");
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Still loading or the store has no group — render nothing to keep the
  // header clean.
  if (membership === null) return null;

  const href = `/store/${slug}/group`;

  if (membership === "approved") {
    return (
      <Link
        href={href}
        className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-emerald-300/50 bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2 text-xs font-extrabold text-emerald-950 shadow-lg shadow-emerald-950/30 transition-all hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(52,211,153,0.45)]"
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <MessageSquare className="h-3.5 w-3.5" />
        {t("group.enterCta")}
      </Link>
    );
  }

  if (membership === "pending") {
    return (
      <Link
        href={href}
        className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white/70 backdrop-blur"
        aria-disabled="true"
      >
        <Clock className="h-3.5 w-3.5" />
        {t("group.pendingReview")}
      </Link>
    );
  }

  // none / rejected → join request CTA
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-400/20 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-950/20 backdrop-blur transition hover:bg-sky-400/30"
    >
      {membership === "rejected" ? (
        <Users className="h-3.5 w-3.5 text-sky-200" />
      ) : (
        <UserPlus className="h-3.5 w-3.5 text-sky-200" />
      )}
      {membership === "rejected" ? t("group.joinCta") : t("group.join")}
    </Link>
  );
}

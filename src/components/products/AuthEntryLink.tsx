"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

interface AuthEntryLinkProps {
  /** Destination for authenticated users (the Aura Hub). */
  href?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Landing-page CTA that routes by session state: authenticated users go to
 * `/select-product` (Aura Hub), everyone else to `/sign-in`. Defaults to
 * `/sign-in` until `/api/auth/me` resolves — the proxy bounces signed-in
 * users from auth pages to the hub anyway, so the fallback is safe.
 */
export default function AuthEntryLink({
  href = "/select-product",
  className,
  children,
}: AuthEntryLinkProps) {
  const [target, setTarget] = useState("/sign-in");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: unknown } | null) => {
        if (!cancelled && data?.user) setTarget(href);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [href]);

  return (
    <Link href={target} className={className}>
      {children}
    </Link>
  );
}

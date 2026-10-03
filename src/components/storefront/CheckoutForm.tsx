"use client";

import { useCallback, useEffect, useRef } from "react";

import type { CartItem } from "@/lib/cart";

/** Guest cart state is synced this long after the last keystroke/change. */
const DEBOUNCE_MS = 1500;

function storageKey(slug: string): string {
  return `storehub_recovery_${slug}`;
}

function readStoredToken(slug: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}

function writeStoredToken(slug: string, token: string): void {
  try {
    window.sessionStorage.setItem(storageKey(slug), token);
  } catch {
    // Storage unavailable (private mode) — the ?recover= link still works.
  }
}

export interface CheckoutFormProps {
  slug: string;
  storeId: string;
  items: CartItem[];
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** Token returned by a previous sync or provided via `?recover=`. */
  recoveryToken?: string | null;
  /** True once the order has been placed — closes the abandoned cart. */
  completed?: boolean;
}

interface Snapshot {
  signature: string;
  slug: string;
  storeId: string;
  items: { productId: string; name: string; price: string; quantity: number; imageUrl: string }[];
  totalAmount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

/**
 * Headless "Abandoned Cart Recovery" auto-save listener.
 *
 * Mount it anywhere inside the storefront checkout page: it watches the guest
 * contact fields and the cart, then debounces a sync to
 * `POST /api/storefront/abandoned-carts` on every change (and immediately when
 * a field loses focus). The first response hands back a `recoveryToken` which
 * is reused for every later update and persisted in sessionStorage so the
 * WhatsApp deep link always points at the same cart row. When the order is
 * completed the cart is flagged as recovered.
 */
export default function CheckoutForm({
  slug,
  storeId,
  items,
  totalAmount,
  customerName,
  customerPhone,
  customerEmail,
  recoveryToken = null,
  completed = false,
}: CheckoutFormProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(recoveryToken);
  const syncedSignatureRef = useRef<string>("");
  const latestRef = useRef<Snapshot>({
    signature: "",
    slug,
    storeId,
    items: [],
    totalAmount: 0,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
  });

  const signature = JSON.stringify({
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      imageUrl: item.imageUrl,
    })),
    totalAmount,
    customerName,
    customerPhone,
    customerEmail,
  });

  const sync = useCallback(async (action: "save" | "recovered") => {
    const snapshot = latestRef.current;
    if (!snapshot.slug) return;
    if (action === "save" && snapshot.items.length === 0) return;
    if (action === "recovered" && !tokenRef.current) return;

    try {
      const res = await fetch("/api/storefront/abandoned-carts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: snapshot.slug,
          storeId: snapshot.storeId,
          customerName: snapshot.customerName,
          customerPhone: snapshot.customerPhone,
          customerEmail: snapshot.customerEmail,
          items: snapshot.items,
          totalAmount: snapshot.totalAmount,
          recoveryToken: tokenRef.current,
          action,
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as {
        saved?: boolean;
        recoveryToken?: string;
      };

      if (action === "save" && data.saved) {
        syncedSignatureRef.current = snapshot.signature;
        if (data.recoveryToken) {
          tokenRef.current = data.recoveryToken;
          writeStoredToken(snapshot.slug, data.recoveryToken);
        }
      }
    } catch {
      // Offline / transient failure — the next change retries automatically.
    }
  }, []);

  // Keep the snapshot handed to `sync()` in sync with the rendered form.
  useEffect(() => {
    latestRef.current = {
      signature,
      slug,
      storeId,
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        imageUrl: item.imageUrl,
      })),
      totalAmount,
      customerName,
      customerPhone,
      customerEmail,
    };
  }, [
    signature,
    slug,
    storeId,
    items,
    totalAmount,
    customerName,
    customerPhone,
    customerEmail,
  ]);

  // Recover a token persisted by an earlier visit (or a fresh mount).
  useEffect(() => {
    if (!tokenRef.current && slug) {
      const stored = readStoredToken(slug);
      if (stored) tokenRef.current = stored;
    }
  }, [slug]);

  // Debounced auto-save on every cart / contact change.
  useEffect(() => {
    if (completed) return;
    if (signature === syncedSignatureRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void sync("save");
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [signature, completed, sync]);

  // Flush immediately when the shopper leaves a field (blur).
  useEffect(() => {
    if (completed) return;

    const flush = () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void sync("save");
    };

    document.addEventListener("focusout", flush);
    return () => document.removeEventListener("focusout", flush);
  }, [completed, sync]);

  // Order placed -> mark the abandoned cart as recovered.
  useEffect(() => {
    if (completed) void sync("recovered");
  }, [completed, sync]);

  return null;
}

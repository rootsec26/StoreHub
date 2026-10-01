"use client";

import { create } from "zustand";
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  getSupabaseAccessToken,
  getSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import type { Order, OrderStatus, OrdersSummary } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";

const POLL_INTERVAL_MS = 30_000;
const MAX_KNOWN_IDS = 500;

export type RealtimeStatus = "idle" | "connecting" | "live" | "polling";

export interface OrderChangeEvent {
  type: "INSERT" | "UPDATE" | "DELETE";
  order: Order | null;
  oldId: string | null;
  at: number;
}

interface OrderRowRaw {
  id?: string | null;
  store_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  notes?: string | null;
  total_amount?: string | number | null;
  status?: string | null;
  created_at?: string | null;
}

interface OrdersRealtimeState {
  storeId: string | null;
  status: RealtimeStatus;
  pendingCount: number;
  lastEvent: OrderChangeEvent | null;
  newPendingOrder: Order | null;
  connect: (storeId: string) => void;
  disconnect: () => void;
  refreshSummary: () => Promise<void>;
  consumeNewPendingOrder: () => void;
}

type StoreSet = (
  partial:
    | Partial<OrdersRealtimeState>
    | ((state: OrdersRealtimeState) => Partial<OrdersRealtimeState>)
) => void;
type StoreGet = () => OrdersRealtimeState;

let activeChannel: RealtimeChannel | null = null;
let activeClient: SupabaseClient | null = null;
let activeStoreId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let knownPendingIds: Set<string> = new Set();
let hasSummary = false;

function toOrder(row: OrderRowRaw): Order | null {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    storeId: row.store_id ?? "",
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? "",
    customerAddress: row.customer_address ?? "",
    notes: row.notes ?? "",
    totalAmount: String(row.total_amount ?? "0"),
    status: (row.status ?? "Pending") as OrderStatus,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

async function fetchSummary(): Promise<OrdersSummary | null> {
  try {
    const res = await fetch("/api/orders?summary=1", { cache: "no-store" });
    if (!res.ok) return null;
    const data: OrdersSummary = await res.json();
    if (typeof data.pendingCount !== "number" || !Array.isArray(data.pendingIds)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function teardownConnection(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (activeChannel && activeClient) {
    void activeClient.removeChannel(activeChannel);
  }
  activeChannel = null;
  activeClient = null;
  activeStoreId = null;
}

function startPolling(set: StoreSet): void {
  set({ status: "polling" });

  const poll = async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (!res.ok) return;
      const data: { orders?: Order[]; pendingCount?: number } = await res.json();
      const all = data.orders ?? [];
      const pending = all.filter((order) => order.status === "Pending");
      const nextIds = new Set(pending.map((order) => order.id));

      if (hasSummary) {
        const fresh = pending.filter(
          (order) => !knownPendingIds.has(order.id)
        );
        if (fresh.length > 0) {
          set({ newPendingOrder: fresh[0] });
        }
      }

      // Bound the set size to prevent memory growth
      if (nextIds.size > MAX_KNOWN_IDS) {
        const ids = Array.from(nextIds);
        knownPendingIds = new Set(ids.slice(-MAX_KNOWN_IDS));
      } else {
        knownPendingIds = nextIds;
      }
      hasSummary = true;
      set({
        pendingCount: pending.length,
        lastEvent: { type: "UPDATE", order: null, oldId: null, at: Date.now() },
      });
    } catch {
      // Transient network failure — keep polling on the next tick.
    }
  };

  void poll();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

async function bootstrap(storeId: string, set: StoreSet, get: StoreGet): Promise<void> {
  const summary = await fetchSummary();
  if (summary && activeStoreId === storeId) {
    knownPendingIds = new Set(summary.pendingIds);
    hasSummary = true;
    set({ pendingCount: summary.pendingCount });
  }

  if (activeStoreId !== storeId) return;

  const token = await getSupabaseAccessToken();
  if (!token) {
    startPolling(set);
    return;
  }

  try {
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`orders:${storeId}`);

    channel
      .on<OrderRowRaw>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          if (payload.errors && payload.errors.length > 0) return;
          const at = Date.now();

          if (payload.eventType === "INSERT") {
            const order = toOrder(payload.new);
            if (!order) return;
            if (order.status === "Pending") {
              knownPendingIds.add(order.id);
              // Bound the set size
              if (knownPendingIds.size > MAX_KNOWN_IDS) {
                const ids = Array.from(knownPendingIds);
                knownPendingIds = new Set(ids.slice(-MAX_KNOWN_IDS));
              }
              set({ pendingCount: get().pendingCount + 1 });
            }
            set({
              lastEvent: { type: "INSERT", order, oldId: null, at },
              newPendingOrder: order.status === "Pending" ? order : null,
            });
            return;
          }

          if (payload.eventType === "UPDATE") {
            const order = toOrder(payload.new);
            set({
              lastEvent: { type: "UPDATE", order, oldId: payload.old?.id ?? null, at },
            });
            void get().refreshSummary();
            return;
          }

          set({
            lastEvent: { type: "DELETE", order: null, oldId: payload.old?.id ?? null, at },
          });
          void get().refreshSummary();
        }
      )
      .subscribe((status) => {
        if (activeStoreId !== storeId) return;

        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          set({ status: "live" });
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED
        ) {
          startPolling(set);
        }
      });

    activeClient = client;
    activeChannel = channel;
  } catch (error) {
    console.warn("Realtime unavailable, falling back to polling:", error);
    startPolling(set);
  }
}

export const useOrdersRealtime = create<OrdersRealtimeState>()((set, get) => ({
  storeId: null,
  status: "idle",
  pendingCount: 0,
  lastEvent: null,
  newPendingOrder: null,

  connect: (storeId: string) => {
    if (!storeId) return;
    if (activeStoreId === storeId) return;

    teardownConnection();
    // Clear known IDs on store switch to prevent memory growth
    knownPendingIds = new Set();
    hasSummary = false;
    activeStoreId = storeId;
    set({ storeId, status: "connecting" });
    void bootstrap(storeId, set, get);
  },

  disconnect: () => {
    teardownConnection();
    hasSummary = false;
    knownPendingIds = new Set();
    set({
      storeId: null,
      status: "idle",
      pendingCount: 0,
      lastEvent: null,
      newPendingOrder: null,
    });
  },

  refreshSummary: async () => {
    const summary = await fetchSummary();
    if (!summary) return;
    knownPendingIds = new Set(summary.pendingIds);
    // Bound the set size
    if (knownPendingIds.size > MAX_KNOWN_IDS) {
      const ids = Array.from(knownPendingIds);
      knownPendingIds = new Set(ids.slice(-MAX_KNOWN_IDS));
    }
    hasSummary = true;
    set({ pendingCount: summary.pendingCount });
  },

  consumeNewPendingOrder: () => {
    if (get().newPendingOrder) set({ newPendingOrder: null });
  },
}));

// Server-side broadcast function for webhook handlers
export async function broadcastOrderUpdate(
  storeId: string,
  orderUpdate: {
    orderId: string;
    status: string;
    customerName: string;
    totalAmount: string;
    createdAt: string;
  }
): Promise<void> {
  if (typeof window !== "undefined") return;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn("[realtime] Supabase credentials not configured for broadcast");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const channel = supabase.channel(`orders:${storeId}`);
    await channel.send({
      type: "broadcast",
      event: "order_update",
      payload: orderUpdate,
    });
  } catch (error) {
    console.error("[realtime] Failed to broadcast order update:", error);
  }
}

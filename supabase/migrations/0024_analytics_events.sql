-- ============================================================
-- ANALYTICS EVENTS (platform traffic & conversions)
-- ============================================================
-- First-party, lightweight analytics for the admin dashboard.
-- visitor_id is a random browser UUID (localStorage), not an IP address.
-- PAGE_VIEW rows are written by /api/analytics/track; SIGNUP and
-- ORDER_CREATED rows are written server-side by auth/checkout flows.

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  path TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON analytics_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_created_idx
  ON analytics_events (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_store_created_idx
  ON analytics_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_order_id_idx
  ON analytics_events (order_id);

-- Analytics rows are only read through the server-side admin API. Keep the
-- table closed to Supabase anon/authenticated clients.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

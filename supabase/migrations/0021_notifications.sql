CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- NOTIFICATIONS (merchant -> customer campaigns, admin broadcasts)
-- ============================================================
-- `scope` distinguishes tenant messages from platform announcements:
--   MERCHANT_TO_CUSTOMER : store_id is required, channel is WHATSAPP
--   ADMIN_TO_MERCHANT    : store_id is NULL,     channel is IN_APP
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope TEXT NOT NULL CHECK (scope IN ('MERCHANT_TO_CUSTOMER', 'ADMIN_TO_MERCHANT')),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('MERCHANT', 'ADMIN')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK (category IN ('GENERAL', 'ANNOUNCEMENT', 'PROMOTION', 'ORDER_UPDATE', 'SYSTEM')),
  priority TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'WHATSAPP')),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'CANCELLED')),
  audience_type TEXT NOT NULL
    CHECK (audience_type IN (
      'ALL_CUSTOMERS', 'SELECTED_CUSTOMERS', 'CUSTOMER_SEGMENT',
      'ALL_MERCHANTS', 'SELECTED_MERCHANTS', 'MERCHANT_PLAN'
    )),
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_scope_store_check CHECK (
    (scope = 'MERCHANT_TO_CUSTOMER' AND store_id IS NOT NULL AND channel = 'WHATSAPP')
    OR
    (scope = 'ADMIN_TO_MERCHANT' AND store_id IS NULL AND channel = 'IN_APP')
  ),
  CONSTRAINT notifications_counts_check CHECK (
    recipient_count >= 0
    AND delivered_count >= 0
    AND failed_count >= 0
    AND read_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS notifications_store_created_idx
  ON notifications (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_scope_created_idx
  ON notifications (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_status_idx
  ON notifications (status);
CREATE INDEX IF NOT EXISTS notifications_scheduled_at_idx
  ON notifications (scheduled_at);

-- ============================================================
-- NOTIFICATION RECIPIENTS (per-recipient delivery + read log)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  -- Stable key: 'customer:<uuid>' or 'user:<uuid>'.
  recipient_key TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('CUSTOMER', 'MERCHANT')),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT NOT NULL DEFAULT '',
  recipient_email TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'WHATSAPP')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'READ')),
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Customer recipients may be order-only contacts (no `customers` row), so
  -- the snapshot phone is the identity guarantee for that type.
  CONSTRAINT notification_recipients_identity_check CHECK (
    (recipient_type = 'CUSTOMER' AND store_id IS NOT NULL AND recipient_phone <> '')
    OR
    (recipient_type = 'MERCHANT' AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_recipients_notification_key_unique
  ON notification_recipients (notification_id, recipient_key);
CREATE INDEX IF NOT EXISTS notification_recipients_notification_status_idx
  ON notification_recipients (notification_id, status);
CREATE INDEX IF NOT EXISTS notification_recipients_user_read_idx
  ON notification_recipients (user_id, read_at);
CREATE INDEX IF NOT EXISTS notification_recipients_store_created_idx
  ON notification_recipients (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_recipients_customer_idx
  ON notification_recipients (customer_id);

-- ============================================================
-- NOTIFICATION EVENTS (append-only audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('MERCHANT', 'ADMIN', 'SYSTEM')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL
    CHECK (event IN ('CREATED', 'SEND_STARTED', 'BATCH_SENT', 'SENT', 'PARTIAL', 'FAILED', 'CANCELLED', 'READ')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_events_notification_created_idx
  ON notification_events (notification_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (defense in depth; API-layer tenancy is authoritative)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- Notifications: owners read/write their store's campaigns. Platform
-- broadcasts are delivered through the service role and visible through
-- recipient rows.
DROP POLICY IF EXISTS "Notifications owner read" ON notifications;
CREATE POLICY "Notifications owner read" ON notifications
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Notifications owner insert" ON notifications;
CREATE POLICY "Notifications owner insert" ON notifications
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Notifications owner update" ON notifications;
CREATE POLICY "Notifications owner update" ON notifications
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Recipients: a merchant sees recipient rows belonging to their store, or
-- their own merchant inbox rows.
DROP POLICY IF EXISTS "Notification recipients owner read" ON notification_recipients;
CREATE POLICY "Notification recipients owner read" ON notification_recipients
  FOR SELECT USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR notification_id IN (
      SELECT id FROM notifications
      WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Notification recipients owner update" ON notification_recipients;
CREATE POLICY "Notification recipients owner update" ON notification_recipients
  FOR UPDATE USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Events: readable by the owning store.
DROP POLICY IF EXISTS "Notification events owner read" ON notification_events;
CREATE POLICY "Notification events owner read" ON notification_events
  FOR SELECT USING (
    notification_id IN (
      SELECT id FROM notifications
      WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
  );

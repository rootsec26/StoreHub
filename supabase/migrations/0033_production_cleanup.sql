-- ============================================================
-- 0033_production_cleanup.sql — pre-launch data purge
-- ============================================================
-- Wipes ALL test/dummy users, stores, products, orders, chat
-- sessions, and every other tenant-scoped row so the database is
-- clean for production.
--
-- KEEP LIST: accounts whose email appears in `_keep_emails` are
-- preserved, along with their stores and all store data. By default
-- the list is EMPTY = full wipe. Add real admin/seed emails before
-- running if you need to keep an account, e.g.:
--   INSERT INTO _keep_emails (email) VALUES ('admin@yourdomain.com');
--
-- PRESERVED (platform-level, not tenant data):
--   activation_code_pricing, activation_codes (codes stay valid;
--   used_by_store_id is nulled for deleted stores)
--
-- Auth sessions are JWT cookies — nothing to delete in the DB.
-- Chat/session records live in `ai_chat_sessions` and are purged.
--
-- Run inside a transaction; verify counts first if unsure:
--   BEGIN;  ...  ROLLBACK;  -- or COMMIT;
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Keep-list (EDIT BEFORE RUNNING — empty = wipe everyone)
-- ------------------------------------------------------------
CREATE TEMP TABLE _keep_emails (email text PRIMARY KEY);
-- INSERT INTO _keep_emails (email) VALUES ('admin@yourdomain.com');

-- Stores owned by doomed users, and doomed users themselves.
CREATE TEMP TABLE _doomed_stores AS
SELECT s.id
FROM stores s
WHERE s.owner_id NOT IN (
  SELECT u.id FROM users u
  JOIN _keep_emails k ON u.email = k.email
);

CREATE TEMP TABLE _doomed_users AS
SELECT id FROM users
WHERE email NOT IN (SELECT email FROM _keep_emails);

CREATE TEMP TABLE _doomed_orders AS
SELECT id FROM orders WHERE store_id IN (SELECT id FROM _doomed_stores);

CREATE TEMP TABLE _doomed_customers AS
SELECT id FROM customers WHERE store_id IN (SELECT id FROM _doomed_stores);

CREATE TEMP TABLE _doomed_notifications AS
SELECT id FROM notifications
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR created_by_user_id IN (SELECT id FROM _doomed_users);

-- ------------------------------------------------------------
-- 1. Order-scoped children (logs, items, analytics, sessions)
-- ------------------------------------------------------------
DELETE FROM order_status_logs
WHERE order_id IN (SELECT id FROM _doomed_orders)
   OR store_id IN (SELECT id FROM _doomed_stores)
   OR changed_by_user_id IN (SELECT id FROM _doomed_users);

DELETE FROM order_items
WHERE order_id IN (SELECT id FROM _doomed_orders)
   OR product_id IN (
     SELECT id FROM products
     WHERE store_id IN (SELECT id FROM _doomed_stores)
   );

-- ------------------------------------------------------------
-- 2. Notifications (recipients + events before parent rows)
-- ------------------------------------------------------------
DELETE FROM notification_events
WHERE notification_id IN (SELECT id FROM _doomed_notifications)
   OR actor_user_id IN (SELECT id FROM _doomed_users);

DELETE FROM notification_recipients
WHERE notification_id IN (SELECT id FROM _doomed_notifications)
   OR user_id IN (SELECT id FROM _doomed_users)
   OR store_id IN (SELECT id FROM _doomed_stores)
   OR customer_id IN (SELECT id FROM _doomed_customers);

DELETE FROM notifications
WHERE id IN (SELECT id FROM _doomed_notifications);

-- ------------------------------------------------------------
-- 3. AI / social chat sessions and channel connections
-- ------------------------------------------------------------
DELETE FROM ai_chat_sessions
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM social_channels
WHERE store_id IN (SELECT id FROM _doomed_stores);

-- ------------------------------------------------------------
-- 4. Loyalty / VIP / customers
-- ------------------------------------------------------------
DELETE FROM loyalty_transactions
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR customer_id IN (SELECT id FROM _doomed_customers)
   OR order_id IN (SELECT id FROM _doomed_orders);

DELETE FROM customers
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM vip_tiers
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM loyalty_settings
WHERE store_id IN (SELECT id FROM _doomed_stores);

-- ------------------------------------------------------------
-- 5. Catalog & commerce config per store
-- ------------------------------------------------------------
DELETE FROM price_alerts
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM abandoned_carts
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM promotions
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM coupons
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM shipping_integrations
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM shipping_zones
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM store_add_ons
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM store_credits
WHERE store_id IN (SELECT id FROM _doomed_stores);

-- ------------------------------------------------------------
-- 6. Warehouse stock (children before warehouses/products)
-- ------------------------------------------------------------
DELETE FROM stock_transfers
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR product_id IN (
     SELECT id FROM products
     WHERE store_id IN (SELECT id FROM _doomed_stores)
   )
   OR from_warehouse_id IN (
     SELECT id FROM warehouses
     WHERE store_id IN (SELECT id FROM _doomed_stores)
   )
   OR to_warehouse_id IN (
     SELECT id FROM warehouses
     WHERE store_id IN (SELECT id FROM _doomed_stores)
   );

DELETE FROM warehouse_stock
WHERE warehouse_id IN (
    SELECT id FROM warehouses
    WHERE store_id IN (SELECT id FROM _doomed_stores)
  )
   OR product_id IN (
     SELECT id FROM products
     WHERE store_id IN (SELECT id FROM _doomed_stores)
   );

DELETE FROM warehouses
WHERE store_id IN (SELECT id FROM _doomed_stores);

-- ------------------------------------------------------------
-- 7. Store social proof / verification / team
-- ------------------------------------------------------------
DELETE FROM store_reviews
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM store_followers
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM store_verification_requests
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM store_members
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR user_id IN (SELECT id FROM _doomed_users);

DELETE FROM store_invitations
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR invited_by_user_id IN (SELECT id FROM _doomed_users)
   OR accepted_by_user_id IN (SELECT id FROM _doomed_users);

-- ------------------------------------------------------------
-- 8. Orders, products, categories, stores
-- ------------------------------------------------------------
DELETE FROM orders
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM products
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM categories
WHERE store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM stores
WHERE id IN (SELECT id FROM _doomed_stores);

-- ------------------------------------------------------------
-- 9. Analytics stragglers + billing references, then users
-- ------------------------------------------------------------
DELETE FROM analytics_events
WHERE store_id IN (SELECT id FROM _doomed_stores)
   OR user_id IN (SELECT id FROM _doomed_users)
   OR order_id IN (SELECT id FROM _doomed_orders);

-- Keep issued activation codes valid; just detach deleted stores.
UPDATE activation_codes
SET used_by_store_id = NULL
WHERE used_by_store_id IN (SELECT id FROM _doomed_stores);

DELETE FROM users
WHERE id IN (SELECT id FROM _doomed_users);

-- Report what was removed.
DO $$
DECLARE
  n_stores int;
  n_users int;
BEGIN
  SELECT count(*) INTO n_stores FROM _doomed_stores;
  SELECT count(*) INTO n_users FROM _doomed_users;
  RAISE NOTICE 'Cleanup complete: % store(s), % user(s) purged.', n_stores, n_users;
END $$;

COMMIT;

-- ============================================================
-- RECONCILE TEAM TABLES WITH THE APP SCHEMA
-- ============================================================
-- `0022_team_members.sql` used CREATE TABLE IF NOT EXISTS, so on
-- databases where `store_members` / `store_invitations` already existed
-- (created earlier with a different shape) the new columns, checks and
-- defaults were never applied. The app writes uppercase role/status
-- values ('ADMIN', 'PENDING', 'REVOKED', ...) and columns such as
-- `invited_by_user_id` / `accepted_by_user_id`, so every write failed
-- with a 500. This migration brings the live tables in line with
-- src/db/schema.ts. Safe to run repeatedly.

-- ------------------------------------------------------------
-- store_members
-- ------------------------------------------------------------

-- user_id must reference public.users (the app's own user table). The
-- legacy FK pointed at auth.users, which stays empty because the app
-- mints its own session JWTs — no member row could ever be inserted.
ALTER TABLE store_members DROP CONSTRAINT IF EXISTS store_members_user_id_fkey;
ALTER TABLE store_members
  ADD CONSTRAINT store_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Normalize any legacy lowercase roles, then enforce the app's roles.
UPDATE store_members SET role = upper(role) WHERE role <> upper(role);
ALTER TABLE store_members DROP CONSTRAINT IF EXISTS store_members_role_check;
ALTER TABLE store_members
  ADD CONSTRAINT store_members_role_check CHECK (role IN ('ADMIN'));

ALTER TABLE store_members ALTER COLUMN role SET DEFAULT 'ADMIN';
ALTER TABLE store_members ALTER COLUMN created_at SET DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS store_members_store_user_unique
  ON store_members (store_id, user_id);
CREATE INDEX IF NOT EXISTS store_members_user_idx ON store_members (user_id);
CREATE INDEX IF NOT EXISTS store_members_store_idx ON store_members (store_id);

-- ------------------------------------------------------------
-- store_invitations
-- ------------------------------------------------------------

ALTER TABLE store_invitations
  ADD COLUMN IF NOT EXISTS invited_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

-- Normalize legacy lowercase statuses, then enforce the app's statuses
-- (adds REVOKED, which the legacy check rejected).
UPDATE store_invitations SET status = upper(status) WHERE status <> upper(status);
ALTER TABLE store_invitations DROP CONSTRAINT IF EXISTS store_invitations_status_check;
ALTER TABLE store_invitations
  ADD CONSTRAINT store_invitations_status_check
  CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'));

ALTER TABLE store_invitations ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE store_invitations ALTER COLUMN role SET DEFAULT 'ADMIN';

CREATE INDEX IF NOT EXISTS store_invitations_store_idx
  ON store_invitations (store_id, status);
CREATE INDEX IF NOT EXISTS store_invitations_email_idx
  ON store_invitations (lower(email));

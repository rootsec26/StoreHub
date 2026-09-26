-- Ensures `public.users` matches the columns written by src/db/schema.ts.
-- The app signs users up by inserting into this table directly (it mints its
-- own session JWTs, so Supabase auth.users / database triggers are not used).
-- Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%email%'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- The app connects as `postgres` (bypasses RLS) but keep an explicit policy so
-- PostgREST/Supabase-side reads of a user's own row keep working.
DROP POLICY IF EXISTS "Users can read own" ON users;
CREATE POLICY "Users can read own" ON users
  FOR SELECT USING (id = auth.uid());

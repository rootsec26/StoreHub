-- ============================================================
-- Phase 2: Supabase Realtime — live order updates
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- The dashboard subscribes to `postgres_changes` on `orders`
-- filtered by `store_id=eq.{store_id}`. Realtime enforces RLS,
-- so subscribers only receive rows their session can SELECT
-- (see "Orders owner read" in supabase/schema.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Allow the orders table to stream changes
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. (Optional) Keep the previous row image on UPDATE events so
--    payload.old contains more than the primary key.
--    Slightly increases WAL volume — only enable if you need it.
-- ------------------------------------------------------------
-- alter table public.orders replica identity full;

-- ------------------------------------------------------------
-- 3. Verify
-- ------------------------------------------------------------
-- select * from pg_publication_tables where pubname = 'supabase_realtime';

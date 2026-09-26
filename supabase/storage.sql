-- ============================================================
-- Phase 2: Supabase Storage — public bucket `store-assets`
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Layout enforced by RLS (tenant isolation):
--   {store_id}/branding/{file}   -> store logo / cover image
--   {store_id}/products/{file}   -> product images
--
-- Every path is validated against `stores.owner_id = auth.uid()`,
-- so a tenant can never write into another tenant's folder.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets',
  'store-assets',
  true,
  5 * 1024 * 1024, -- 5 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. Helper: returns true when the authenticated user owns the
--    store folder at the top of the object path.
-- ------------------------------------------------------------
create or replace function public.store_owns_asset_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.stores s
    where s.owner_id = auth.uid()
      and s.id::text = (storage.foldername(object_name))[1]
  );
$$;

revoke all on function public.store_owns_asset_path(text) from public;
grant execute on function public.store_owns_asset_path(text) to authenticated;

-- ------------------------------------------------------------
-- 3. Object-level policies (idempotent)
-- ------------------------------------------------------------

-- Public bucket: anyone can read store assets (logos, covers, product images).
drop policy if exists "store_assets_public_read" on storage.objects;
create policy "store_assets_public_read" on storage.objects
  for select
  using (bucket_id = 'store-assets');

-- Owners may only insert objects inside their own store folder,
-- under an allowed sub-folder, as image files.
drop policy if exists "store_assets_owner_insert" on storage.objects;
create policy "store_assets_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'store-assets'
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] in ('branding', 'products')
    and public.store_owns_asset_path(name)
    and owner is not null
    and owner = auth.uid()
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- Owners may overwrite/replace their own objects only.
drop policy if exists "store_assets_owner_update" on storage.objects;
create policy "store_assets_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.store_owns_asset_path(name)
  )
  with check (
    bucket_id = 'store-assets'
    and array_length(storage.foldername(name), 1) >= 2
    and (storage.foldername(name))[2] in ('branding', 'products')
    and public.store_owns_asset_path(name)
  );

-- Owners may delete their own objects only.
drop policy if exists "store_assets_owner_delete" on storage.objects;
create policy "store_assets_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'store-assets'
    and public.store_owns_asset_path(name)
  );

-- ------------------------------------------------------------
-- 4. Verify
-- ------------------------------------------------------------
-- select id, public, file_size_limit from storage.buckets where id = 'store-assets';
-- select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--   and policyname like 'store_assets%';

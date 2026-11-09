-- ============================================================
-- 0027: Drop SVG from the store-assets bucket allow-list
-- ============================================================
-- SVG can embed executable script (vector-XSS). Uploads go straight from
-- the browser to Supabase Storage, so the app cannot sanitize them — the
-- only reliable control is the bucket's allowed_mime_types. Raster formats
-- (JPEG/PNG/WebP/GIF/AVIF) remain allowed; merchants must use PNG/WebP
-- for logos that were previously SVG.
-- Idempotent: safe to run repeatedly.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id = 'store-assets';

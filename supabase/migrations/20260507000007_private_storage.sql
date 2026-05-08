-- Switch the `hejmae` storage bucket from public to private and migrate
-- DB-stored URLs to bare storage paths.
--
-- Threat model: with a public bucket, any URL leaked via referrer, browser
-- history, indexed page, or shared screenshot grants permanent access to
-- the underlying asset (floor plans, receipts, item photos — often
-- tenant-private). After this migration the asset can only be reached via
-- a signed URL minted server-side, with a short TTL.
--
-- Steps:
--   1. Strip the public-URL prefix from every stored value so columns hold
--      just the storage path (e.g. `floor-plan/<designer>/<project>/x.webp`).
--      Values that don't match the legacy pattern (truly external URLs,
--      already-paths) pass through unchanged.
--   2. Drop the storage.objects read policy that allowed anon/authenticated
--      reads, and flip the bucket's `public` flag.
--   3. App code in the same release reads via createSignedUrl() at the
--      moment of use.

-- (1) Rewrite legacy public URLs → paths.
-- Pattern matched: https://<host>/storage/v1/object/public/hejmae/<PATH>
-- regexp_replace returns the input unchanged if the pattern doesn't match.
update public.users
   set logo_url = regexp_replace(
     logo_url,
     '^https?://[^/]+/storage/v1/object/public/hejmae/',
     ''
   )
 where logo_url is not null;

update public.projects
   set floor_plan_url = regexp_replace(
     floor_plan_url,
     '^https?://[^/]+/storage/v1/object/public/hejmae/',
     ''
   )
 where floor_plan_url is not null;

update public.items
   set image_url = regexp_replace(
     image_url,
     '^https?://[^/]+/storage/v1/object/public/hejmae/',
     ''
   )
 where image_url is not null;

update public.catalog_products
   set image_url = regexp_replace(
     image_url,
     '^https?://[^/]+/storage/v1/object/public/hejmae/',
     ''
   )
 where image_url is not null;

update public.expenses
   set receipt_url = regexp_replace(
     receipt_url,
     '^https?://[^/]+/storage/v1/object/public/hejmae/',
     ''
   )
 where receipt_url is not null;

-- (2) Lock the bucket down.
drop policy if exists hejmae_public_read on storage.objects;

update storage.buckets
   set public = false
 where id = 'hejmae';

-- App code creates signed URLs via the service role; no INSERT/SELECT/UPDATE
-- policies on storage.objects are needed.

comment on column public.users.logo_url is
  'Storage path within hejmae bucket, OR an external https URL. Resolve via lib/storage.resolveAssetUrl().';
comment on column public.projects.floor_plan_url is
  'Storage path within hejmae bucket, OR an external https URL. Resolve via lib/storage.resolveAssetUrl().';
comment on column public.items.image_url is
  'Storage path within hejmae bucket, OR an external https URL. Resolve via lib/storage.resolveAssetUrl().';
comment on column public.catalog_products.image_url is
  'Storage path within hejmae bucket, OR an external https URL. Resolve via lib/storage.resolveAssetUrl().';
comment on column public.expenses.receipt_url is
  'Storage path within hejmae bucket, OR an external https URL. Resolve via lib/storage.resolveAssetUrl().';

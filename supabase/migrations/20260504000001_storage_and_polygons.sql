-- Storage bucket for designer-uploaded assets (floor plans, item images,
-- attached docs) + a polygon column on rooms so room boundaries can be any
-- straight-edged shape.

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
-- Public bucket for v1 simplicity. Files are URL-addressable; URLs use
-- random UUIDs for path components so guessing is infeasible. TODO: switch
-- to private + signed URLs once the portal flow is hardened.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hejmae',
  'hejmae',
  true,
  52428800, -- 50 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- All uploads go through the server (service role), so no per-row INSERT
-- policies on storage.objects are needed. We just allow public reads since
-- the bucket is public.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'hejmae_public_read'
  ) then
    create policy hejmae_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'hejmae');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Room polygons
-- ---------------------------------------------------------------------------
-- Stored as a JSON array of {x,y} points in 0..1 image-fraction coords:
--   [{"x":0.10,"y":0.12},{"x":0.40,"y":0.12},{"x":0.40,"y":0.32}, …]
-- A null/empty value means the room has no spatial footprint yet (it can
-- still hold items and appear in proposals). Legacy rectangle columns
-- (floor_plan_x/y/width/height) are kept for backward compat — readers
-- should prefer floor_plan_polygon when present.
alter table public.rooms
  add column if not exists floor_plan_polygon jsonb;

-- Lightweight shape check: must be a JSON array if present.
alter table public.rooms
  drop constraint if exists rooms_floor_plan_polygon_is_array;
alter table public.rooms
  add constraint rooms_floor_plan_polygon_is_array
  check (floor_plan_polygon is null or jsonb_typeof(floor_plan_polygon) = 'array');

-- clipping_items.canonical_url — used together with source_url for
-- per-user dedup so the same product clipped via different ad URLs
-- (different gclid / utm strings) collapses to a single clipping row.
--
-- source_url stays as the literal clicked URL (what the user sees as
-- "view source"); canonical_url is the <link rel="canonical"> the
-- extension pulled out of the rendered page at clip time. Nullable
-- because not every site emits a canonical and the clipper soft-fails
-- when capture is impossible (chrome:// pages, etc.).

alter table public.clipping_items
  add column canonical_url text;

comment on column public.clipping_items.canonical_url is
  'Canonical URL from <link rel="canonical"> at clip time. Used with source_url for per-user dedup; catalog dedup keys on the same value (see catalog_products.source_url).';

-- Partial-unique mirrors clipping_items_dedup_idx — one canonical per
-- user among live rows. Lets a soft-deleted row be re-clipped.
create unique index clipping_items_canonical_dedup_idx
  on public.clipping_items (clipper_user_id, canonical_url)
  where deleted_at is null and canonical_url is not null;

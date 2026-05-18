-- Add normalized item_type + material to the catalog, and material to
-- clipping_items. clipping_items.item_type already exists; we're just
-- adding the catalog twin so dedup'd clips can inherit it.
--
-- item_type is a single short label ("Lounge chair", "Sconce", "Sofa")
-- normalized by the AI extractor. material is a single short string
-- ("Performance tweed", "Solid walnut") capturing the dominant material
-- or style cue for the card.
--
-- The legacy catalog_products.category column (added in the initial
-- schema, never written by the scrape pipeline) is left in place to
-- avoid a destructive change; new code uses item_type exclusively.
--
-- `if not exists` guards make this safe to re-run if part of the
-- migration was already applied manually (e.g. via the SQL editor).

alter table public.catalog_products
  add column if not exists item_type text,
  add column if not exists material  text;

alter table public.clipping_items
  add column if not exists material text;

comment on column public.catalog_products.item_type is
  'AI-normalized product type label, e.g. "Lounge chair", "Sconce". Mirrored to clipping_items.item_type on catalog dedup.';
comment on column public.catalog_products.material is
  'AI-normalized material or style cue, e.g. "Performance tweed", "Solid walnut". Mirrored to clipping_items.material on catalog dedup.';
comment on column public.clipping_items.material is
  'AI-normalized material or style cue. Sourced from catalog_products.material on dedup; populated directly from the AI extractor on fresh scrapes.';

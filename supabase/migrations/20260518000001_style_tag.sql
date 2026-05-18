-- Add `style_tag` to catalog_products and clipping_items. style_tag is
-- a short design-style label (e.g. "Mid-century modern", "Industrial",
-- "Scandinavian", "Boho", "Art deco") that the AI extractor infers
-- from the product page. It is NOT displayed on the clipping card —
-- it's background data used to power the catalog search / filter UX
-- alongside item_type and material.
--
-- Mirrors the item_type / material pattern from
-- 20260517000001_clipping_item_type_material: column on both tables,
-- catalog row is source of truth on dedup, clipping_items gets a
-- direct copy on fresh scrapes.
--
-- `if not exists` guards make this safe to re-run.

alter table public.catalog_products
  add column if not exists style_tag text;

alter table public.clipping_items
  add column if not exists style_tag text;

comment on column public.catalog_products.style_tag is
  'AI-normalized design style label, e.g. "Mid-century modern", "Industrial", "Scandinavian". Background data for catalog search/filter — not shown on the clipping card.';
comment on column public.clipping_items.style_tag is
  'AI-normalized design style label. Sourced from catalog_products.style_tag on dedup; populated directly from the AI extractor on fresh scrapes.';

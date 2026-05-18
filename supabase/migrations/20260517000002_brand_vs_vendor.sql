-- Split brand (manufacturer) from vendor (where to buy).
--
-- Before this migration, clipping_items.vendor was a mix — sometimes
-- the manufacturer brand pulled from JSON-LD `brand`, sometimes the
-- retailer's site_name / hostname. That confused two flows:
--   1. The clipping card displayed the wrong concept inconsistently.
--   2. add-to-project used clipping_items.vendor to look up the
--      studio's vendor (for trade-discount calculation), which matched
--      the manufacturer instead of the retailer.
--
-- New model:
--   * clipping_items.brand            = manufacturer brand. Display-only.
--   * catalog_products.brand          = manufacturer brand. New.
--   * catalog_products.vendor         = retailer / where to buy. Existing
--                                       column, semantics now strict.
--
-- The retailer is what `items.vendor` should mirror on add-to-project,
-- and what the trade-discount lookup should match against.
--
-- Wrapped in `do` blocks so the migration is safe to re-run if part of
-- it was already applied manually.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clipping_items'
      and column_name = 'vendor'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clipping_items'
      and column_name = 'brand'
  ) then
    alter table public.clipping_items rename column vendor to brand;
  end if;
end$$;

alter table public.catalog_products
  add column if not exists brand text;

comment on column public.clipping_items.brand is
  'Manufacturer / designer brand (e.g. "Gubi", "Vitra"). Display-only on the clipping card; the retailer / purchase source lives on the linked catalog_products.vendor.';
comment on column public.catalog_products.brand is
  'Manufacturer / designer brand. Mirrored from clipping_items on first scrape; informational. The retailer / purchase source is catalog_products.vendor.';
comment on column public.catalog_products.vendor is
  'Retailer / supplier where this product is purchased (e.g. "Design Within Reach"). Matches against the studio''s vendors table for trade-discount calculation; copied to items.vendor on add-to-project.';

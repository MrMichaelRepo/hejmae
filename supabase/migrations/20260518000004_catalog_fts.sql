-- Full-text search on catalog_products.
--
-- Replaces the ILIKE %q% search in /api/catalog with a tsvector + GIN
-- index. websearch_to_tsquery on the route side gives users the familiar
-- "natural" query syntax (quoted phrases, OR, negation).
--
-- Initial weighting (later corrected by 20260518000007_catalog_search_tsv_fix
-- to swap category → item_type and add style_tag).

alter table public.catalog_products
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')),        'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')),       'B') ||
    setweight(to_tsvector('simple', coalesce(vendor, '')),      'C') ||
    setweight(to_tsvector('simple', coalesce(category, '')),    'C') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored;

create index if not exists catalog_products_search_tsv_idx
  on public.catalog_products using gin (search_tsv);

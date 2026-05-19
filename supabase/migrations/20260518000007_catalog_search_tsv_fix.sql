-- Recreate the catalog_products full-text search column with the right
-- inputs. The original (20260518000004) weighted the legacy `category`
-- column and didn't include `style_tag` at all. The column-cleanup
-- migration (20260518000006) dropped the old search_tsv along with the
-- category/style_tags columns it referenced; this migration installs the
-- replacement.
--
-- Final weighting: name > brand > vendor > item_type > style_tag > description.

alter table public.catalog_products
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')),        'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')),       'B') ||
    setweight(to_tsvector('simple', coalesce(vendor, '')),      'C') ||
    setweight(to_tsvector('simple', coalesce(item_type, '')),   'C') ||
    setweight(to_tsvector('simple', coalesce(style_tag, '')),   'D') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored;

create index if not exists catalog_products_search_tsv_idx
  on public.catalog_products using gin (search_tsv);

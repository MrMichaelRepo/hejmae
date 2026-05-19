-- Consolidate catalog_products.
--
-- Two split-brain pairs have piled up:
--   * `style_tags text[]` (initial schema) vs `style_tag text` (added 5
--     days ago by 20260518000001). Admin UI wrote `style_tags`; scrape
--     pipeline wrote `style_tag`; the two never reconciled. The AI
--     extractor only produces a single style label, so keep `style_tag`.
--   * `category` (initial schema) vs `item_type` (added 20260514000003).
--     Migration comment already declared category legacy "new code uses
--     item_type exclusively" but every read path still falls back to
--     category. Keep item_type.
--
-- Backfill the survivors from the deprecated columns before dropping so
-- no production data is lost.
--
-- Also redefines public.match_catalog_products (the ANN search RPC)
-- because its return signature still includes `category` and `style_tags`.
-- create-or-replace can't change a function's return columns, so we drop
-- + recreate.

-- 1. Backfill -----------------------------------------------------------------
update public.catalog_products
   set style_tag = nullif(style_tags[1], '')
 where style_tag is null
   and array_length(style_tags, 1) >= 1;

update public.catalog_products
   set item_type = category
 where item_type is null
   and category is not null;

-- 2. Drop indexes + generated columns that referenced the going-away cols ----
drop index if exists public.catalog_products_style_tags_idx;

-- `search_tsv` (from 20260518000004) is a generated column over
-- `category`. Dropping it here so the column drop below succeeds;
-- 20260518000007 will recreate it with the correct expression.
alter table public.catalog_products
  drop column if exists search_tsv;
drop index if exists public.catalog_products_search_tsv_idx;

-- 3. Drop the columns --------------------------------------------------------
alter table public.catalog_products
  drop column if exists style_tags,
  drop column if exists category;

-- 4. Redefine match_catalog_products to match the new shape ------------------
drop function if exists public.match_catalog_products(vector(1536), float, int);

create function public.match_catalog_products(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
returns table (
  id                        uuid,
  name                      text,
  vendor                    text,
  brand                     text,
  item_type                 text,
  style_tag                 text,
  retail_price_cents        bigint,
  retail_price_last_seen_at timestamptz,
  source_url                text,
  image_url                 text,
  clipped_count             int,
  created_by                uuid,
  created_at                timestamptz,
  updated_at                timestamptz,
  similarity                float
)
language sql
stable
as $$
  select
    cp.id,
    cp.name,
    cp.vendor,
    cp.brand,
    cp.item_type,
    cp.style_tag,
    cp.retail_price_cents,
    cp.retail_price_last_seen_at,
    cp.source_url,
    cp.image_url,
    cp.clipped_count,
    cp.created_by,
    cp.created_at,
    cp.updated_at,
    1 - (cp.embedding <=> query_embedding) as similarity
  from public.catalog_products cp
  where cp.embedding is not null
    and cp.merged_into_id is null
    and cp.deleted_at is null
    and 1 - (cp.embedding <=> query_embedding) >= match_threshold
  order by cp.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_catalog_products(vector(1536), float, int)
  to authenticated, service_role;

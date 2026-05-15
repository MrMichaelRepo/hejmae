-- AI image search on the master catalog.
--
-- We store a 1536-dim text embedding (OpenAI text-embedding-3-small) per
-- catalog_products row. The embedding is generated asynchronously after
-- a row is created or its name/vendor/category/style_tags change — same
-- fire-and-forget pattern as the clipping scraper.
--
-- The search flow:
--   1. Designer uploads an image to /api/catalog/search/image.
--   2. GPT-4o vision returns a text description.
--   3. text-embedding-3-small encodes that description.
--   4. We call match_catalog_products() to do cosine-distance ANN over
--      the HNSW index, keep rows above a similarity threshold, and
--      return them ordered by similarity desc.
--
-- HNSW (not IVFFlat) because:
--   * IVFFlat needs ANALYZE/training; recall is poor until the catalog
--     grows past the per-list threshold.
--   * HNSW works at any catalog size with no training step.
--   * Write cost is higher but the catalog is write-light vs. read-heavy.

create extension if not exists vector;

alter table public.catalog_products
  add column embedding            vector(1536),
  add column embedding_updated_at timestamptz;

-- HNSW index for cosine distance. Default m/ef_construction params; we
-- can tune if recall ever becomes an issue.
create index catalog_products_embedding_idx
  on public.catalog_products
  using hnsw (embedding vector_cosine_ops);

-- Match function. SECURITY INVOKER (default) so the catalog's RLS policy
-- still applies — anon + authenticated can read every row already, so
-- this is effectively wide-open by design.
create or replace function public.match_catalog_products(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
returns table (
  id                        uuid,
  name                      text,
  vendor                    text,
  category                  text,
  retail_price_cents        bigint,
  retail_price_last_seen_at timestamptz,
  source_url                text,
  image_url                 text,
  style_tags                text[],
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
    cp.category,
    cp.retail_price_cents,
    cp.retail_price_last_seen_at,
    cp.source_url,
    cp.image_url,
    cp.style_tags,
    cp.clipped_count,
    cp.created_by,
    cp.created_at,
    cp.updated_at,
    1 - (cp.embedding <=> query_embedding) as similarity
  from public.catalog_products cp
  where cp.embedding is not null
    and 1 - (cp.embedding <=> query_embedding) >= match_threshold
  order by cp.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_catalog_products(vector(1536), float, int)
  to authenticated, service_role;

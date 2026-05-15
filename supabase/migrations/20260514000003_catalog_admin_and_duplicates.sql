-- Catalog admin tooling + automated duplicate detection.
--
-- Three concerns in one migration:
--   1. Platform admin role on users (separate from studio-level roles).
--   2. Catalog soft-delete / merge bookkeeping columns + free-form fields
--      the admin edit panel writes (description, item_type).
--   3. catalog_duplicate_flags table + the merge function that consolidates
--      one catalog row into another atomically.
--
-- All admin-side reads/writes go through the service role from
-- /app/api/admin/*, so RLS on the new flag table is read-blocked by
-- default and the merge function is SECURITY DEFINER. RLS still applies
-- to the changes we make to existing tables (catalog_products is anon
-- SELECT all; items / clipping_items unchanged).

-- ---------------------------------------------------------------------------
-- 1. Platform admin role
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('designer', 'admin');

alter table public.users
  add column role public.user_role not null default 'designer';

create index users_role_admin_idx on public.users (role)
  where role = 'admin';

comment on column public.users.role is
  'Platform-level role. ''admin'' grants access to /admin/* tooling across all studios. Promote manually via SQL — no self-serve.';

-- ---------------------------------------------------------------------------
-- 2. catalog_products: soft delete, merge tracking, free-form fields
-- ---------------------------------------------------------------------------

alter table public.catalog_products
  add column description     text,
  add column item_type       text,
  add column deleted_at      timestamptz,
  add column merged_into_id  uuid references public.catalog_products(id) on delete set null,
  add column merged_at       timestamptz;

create index catalog_products_active_idx
  on public.catalog_products (created_at desc)
  where deleted_at is null and merged_into_id is null;

create index catalog_products_merged_into_idx
  on public.catalog_products (merged_into_id)
  where merged_into_id is not null;

comment on column public.catalog_products.merged_into_id is
  'When non-null, this row was consolidated into the referenced row. Excluded from all catalog queries (filter merged_into_id IS NULL). Record is retained for history.';

-- ---------------------------------------------------------------------------
-- 3. catalog_duplicate_flags
-- ---------------------------------------------------------------------------

create type public.catalog_duplicate_status as enum (
  'pending',
  'confirmed_duplicate',
  'dismissed'
);

create table public.catalog_duplicate_flags (
  id                 uuid primary key default gen_random_uuid(),
  -- Ordering invariant: product_a_id < product_b_id (uuid lexicographic).
  -- Enforced by trigger below; surfaces in the partial unique index.
  product_a_id       uuid not null references public.catalog_products(id) on delete cascade,
  product_b_id       uuid not null references public.catalog_products(id) on delete cascade,
  -- Vector similarity (0..1). Null for manually-flagged pairs.
  similarity_score   numeric(6,5) check (similarity_score is null or (similarity_score >= 0 and similarity_score <= 1)),
  match_reasons      text[] not null default '{}',
  status             public.catalog_duplicate_status not null default 'pending',
  -- True when admin has acted (merged or dismissed). False keeps the row
  -- in the unresolved queue regardless of age. Driven by status.
  resolved           boolean not null default false,
  flagged_at         timestamptz not null default now(),
  -- Refreshed each scan run when the same pair is detected again.
  last_seen_at       timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references public.users(id) on delete set null,
  resolution_notes   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint catalog_duplicate_flags_distinct_products
    check (product_a_id <> product_b_id),
  constraint catalog_duplicate_flags_resolution_coherent
    check (
      (resolved = false and resolved_at is null and resolved_by is null and status = 'pending')
      or (resolved = true and resolved_at is not null and status in ('confirmed_duplicate', 'dismissed'))
    )
);

create trigger catalog_duplicate_flags_set_updated_at
  before update on public.catalog_duplicate_flags
  for each row execute function public.set_updated_at();

-- Unique among UNRESOLVED pairs so the scanner can find-or-update without
-- racing the admin. Once resolved, a new flag can be created for the same
-- pair (admin can override a previous dismissal). Pairs are always stored
-- in lexicographic order, so (A,B) and (B,A) collide.
create unique index catalog_duplicate_flags_pair_unresolved_idx
  on public.catalog_duplicate_flags (product_a_id, product_b_id)
  where resolved = false;

create index catalog_duplicate_flags_unresolved_idx
  on public.catalog_duplicate_flags (flagged_at desc)
  where resolved = false;

create index catalog_duplicate_flags_resolved_idx
  on public.catalog_duplicate_flags (resolved_at desc)
  where resolved = true;

create index catalog_duplicate_flags_product_a_idx
  on public.catalog_duplicate_flags (product_a_id);

create index catalog_duplicate_flags_product_b_idx
  on public.catalog_duplicate_flags (product_b_id);

-- Enforce lexicographic ordering on insert/update. The scanner and the
-- manual-flag route both order client-side as defense in depth.
create or replace function public.catalog_duplicate_flags_enforce_order()
returns trigger
language plpgsql
as $$
declare
  v_tmp uuid;
begin
  if new.product_a_id > new.product_b_id then
    v_tmp := new.product_a_id;
    new.product_a_id := new.product_b_id;
    new.product_b_id := v_tmp;
  end if;
  return new;
end;
$$;

create trigger catalog_duplicate_flags_order_pair
  before insert or update of product_a_id, product_b_id
  on public.catalog_duplicate_flags
  for each row execute function public.catalog_duplicate_flags_enforce_order();

-- ---------------------------------------------------------------------------
-- RLS — admin-only tooling, service-role bypass.
-- ---------------------------------------------------------------------------
--
-- All /api/admin/* routes go through supabaseAdmin() (service role) which
-- bypasses RLS. We still enable + force RLS with no policies so any
-- accidental anon / authenticated path returns zero rows instead of
-- leaking the flag queue.

alter table public.catalog_duplicate_flags enable row level security;
alter table public.catalog_duplicate_flags force row level security;

-- ---------------------------------------------------------------------------
-- 4. merge_catalog_duplicate(flag, keep, remove, resolver, notes)
-- ---------------------------------------------------------------------------
--
-- Atomically consolidates one catalog product into another. Steps:
--   a. Validate the keep/remove pair matches the flag's pair and both rows
--      exist + are not already merged.
--   b. Re-point items.catalog_product_id from remove → keep.
--   c. Re-point clipping_items.catalog_product_id from remove → keep.
--   d. Bump kept product's clipped_count by removed product's count.
--   e. Mark removed product merged_into_id + merged_at.
--   f. Mark the flag confirmed_duplicate / resolved.
--   g. Auto-dismiss any other unresolved flags that reference the removed
--      product (those duplicates are now resolved transitively).
--
-- Returns the kept product's id. Throws on validation failure — the
-- caller surfaces that as a 400.
--
-- SECURITY DEFINER + locked search_path so the service-role caller's RLS
-- context doesn't matter. We don't expose this function to anon /
-- authenticated.

create or replace function public.merge_catalog_duplicate(
  p_flag_id      uuid,
  p_keep_id      uuid,
  p_remove_id    uuid,
  p_resolver_id  uuid,
  p_notes        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flag          public.catalog_duplicate_flags%rowtype;
  v_remove_count  int;
  v_pair_a        uuid;
  v_pair_b        uuid;
begin
  if p_keep_id = p_remove_id then
    raise exception 'keep and remove products must differ';
  end if;

  -- Lock the flag row.
  select * into v_flag
    from public.catalog_duplicate_flags
   where id = p_flag_id
   for update;
  if not found then
    raise exception 'flag % not found', p_flag_id;
  end if;
  if v_flag.resolved then
    raise exception 'flag % is already resolved', p_flag_id;
  end if;

  -- Compute the (sorted) pair for validation. The flag stores them in
  -- lexicographic order; the caller may pass keep/remove in either order.
  if p_keep_id < p_remove_id then
    v_pair_a := p_keep_id;
    v_pair_b := p_remove_id;
  else
    v_pair_a := p_remove_id;
    v_pair_b := p_keep_id;
  end if;
  if v_pair_a <> v_flag.product_a_id or v_pair_b <> v_flag.product_b_id then
    raise exception 'keep/remove pair does not match flag pair';
  end if;

  -- Both products must still exist and be unmerged.
  perform 1
    from public.catalog_products
   where id = p_keep_id and merged_into_id is null and deleted_at is null
   for update;
  if not found then
    raise exception 'kept product % is missing, merged, or deleted', p_keep_id;
  end if;

  select clipped_count into v_remove_count
    from public.catalog_products
   where id = p_remove_id and merged_into_id is null and deleted_at is null
   for update;
  if not found then
    raise exception 'removed product % is missing, merged, or deleted', p_remove_id;
  end if;

  -- Re-point items.
  update public.items
     set catalog_product_id = p_keep_id
   where catalog_product_id = p_remove_id;

  -- Re-point clipping inbox rows.
  update public.clipping_items
     set catalog_product_id = p_keep_id
   where catalog_product_id = p_remove_id;

  -- Bump kept product's clipped_count.
  update public.catalog_products
     set clipped_count = clipped_count + coalesce(v_remove_count, 0)
   where id = p_keep_id;

  -- Mark the removed product merged. We do NOT delete it.
  update public.catalog_products
     set merged_into_id = p_keep_id,
         merged_at      = now()
   where id = p_remove_id;

  -- Resolve this flag as a confirmed duplicate.
  update public.catalog_duplicate_flags
     set status           = 'confirmed_duplicate',
         resolved         = true,
         resolved_at      = now(),
         resolved_by      = p_resolver_id,
         resolution_notes = p_notes
   where id = p_flag_id;

  -- Auto-dismiss any other unresolved flags involving the removed product.
  -- They're stale: the underlying row no longer participates in the live
  -- catalog. The admin can re-flag the kept product if needed.
  update public.catalog_duplicate_flags
     set status      = 'dismissed',
         resolved    = true,
         resolved_at = now()
   where resolved = false
     and id <> p_flag_id
     and (product_a_id = p_remove_id or product_b_id = p_remove_id);

  return p_keep_id;
end;
$$;

revoke all on function public.merge_catalog_duplicate(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.merge_catalog_duplicate(uuid, uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Update match_catalog_products to exclude merged + deleted rows.
-- ---------------------------------------------------------------------------

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
    and cp.merged_into_id is null
    and cp.deleted_at is null
    and 1 - (cp.embedding <=> query_embedding) >= match_threshold
  order by cp.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_catalog_products(vector(1536), float, int)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. find_catalog_duplicate_candidates(source_id, threshold)
-- ---------------------------------------------------------------------------
--
-- Per-product nearest-neighbor query used by the weekly scan job. Returns
-- everything the JS layer needs to compute match_reasons (vendor, price,
-- source URL) without a follow-up roundtrip per candidate.
--
-- We compare the source product against every other live catalog row and
-- keep those above the similarity threshold. The HNSW index makes this
-- cheap even on large catalogs because ORDER BY <=> uses the index.

create or replace function public.find_catalog_duplicate_candidates(
  p_source_id  uuid,
  p_threshold  float
)
returns table (
  source_id          uuid,
  candidate_id       uuid,
  similarity         float,
  source_vendor      text,
  candidate_vendor   text,
  source_price       bigint,
  candidate_price    bigint,
  source_url         text,
  candidate_url      text
)
language sql
stable
as $$
  select
    s.id,
    c.id,
    1 - (s.embedding <=> c.embedding) as similarity,
    s.vendor,
    c.vendor,
    s.retail_price_cents,
    c.retail_price_cents,
    s.source_url,
    c.source_url
  from public.catalog_products s
  join public.catalog_products c
    on c.id <> s.id
   and c.embedding      is not null
   and c.merged_into_id is null
   and c.deleted_at     is null
  where s.id = p_source_id
    and s.embedding      is not null
    and s.merged_into_id is null
    and s.deleted_at     is null
    and 1 - (s.embedding <=> c.embedding) >= p_threshold
  order by s.embedding <=> c.embedding;
$$;

grant execute on function public.find_catalog_duplicate_candidates(uuid, float)
  to service_role;

-- Designer catalog library — every catalog product the designer has used
-- on any of their items, with the most-recent-use timestamp.
--
-- The /api/catalog/library route used to: (1) read items.catalog_product_id
-- for the designer, (2) dedup in JS, (3) refetch matching catalog rows.
-- Two round-trips and a JS de-dup. This view collapses it to a single
-- indexed query.
--
-- View (not materialized) — items churn often, and the SELECT-DISTINCT-ON
-- with the existing indexes is cheap. A materialized variant would force
-- a REFRESH on every item insert/update/delete, which is a worse trade.
--
-- Supporting compound index covers the (designer_id, catalog_product_id,
-- updated_at desc) access path the view uses for DISTINCT ON.

create index if not exists items_designer_catalog_updated_idx
  on public.items (designer_id, catalog_product_id, updated_at desc)
  where catalog_product_id is not null;

create or replace view public.designer_catalog_library
  with (security_invoker = true)
as
select
  i.designer_id,
  c.*,
  max(i.updated_at) as last_used_at
from public.items i
join public.catalog_products c
  on c.id = i.catalog_product_id
where i.catalog_product_id is not null
  and c.merged_into_id is null
  and c.deleted_at is null
group by i.designer_id, c.id;

grant select on public.designer_catalog_library to authenticated, service_role;

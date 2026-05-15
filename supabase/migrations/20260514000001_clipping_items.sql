-- Clipping items: the designer-facing inbox of products clipped from the
-- web via the Hejmae Clipper browser extension. Studio-wide visibility
-- (every team member sees every other member's clippings) but only the
-- author can soft-delete their own.
--
-- Tenancy model matches the rest of the codebase: `designer_id` is the
-- studio owner's users.id (the tenant key). We also denormalize
-- `studio_id` (FK to studios.id) so future schema work can move scoping
-- off designer_id without rewriting every row.
--
-- Trade price column is restricted by convention — never exposed in the
-- /api/clippings list response or the /clippings UI. It rides along on
-- the row so add-to-project can carry it onto the items row in one shot.

create type public.clipping_scrape_status as enum (
  'pending',
  'complete',
  'failed'
);

create table public.clipping_items (
  id                 uuid primary key default gen_random_uuid(),
  designer_id        uuid not null references public.users(id) on delete cascade,
  studio_id          uuid not null references public.studios(id) on delete cascade,
  -- The teammate who actually clipped it. Equals designer_id for solo
  -- studios; differs when a non-owner team member clipped it. Used to
  -- restrict delete to the original clipper.
  clipper_user_id    uuid not null references public.users(id) on delete cascade,
  project_id         uuid references public.projects(id) on delete set null,
  catalog_product_id uuid references public.catalog_products(id) on delete set null,

  source_url         text not null,
  name               text,
  vendor             text,
  image_url          text,
  retail_price_cents bigint check (retail_price_cents is null or retail_price_cents >= 0),
  -- Restricted: read in API only via the add-to-project flow; never
  -- shipped in the list response.
  trade_price_cents  bigint check (trade_price_cents is null or trade_price_cents >= 0),
  description        text,
  item_type          text,

  scrape_status      public.clipping_scrape_status not null default 'pending',
  -- Monday of the ISO week the clip was made (date, no tz). Used for
  -- the "this week / last week" filter chip and grouping.
  week_added         date not null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create trigger clipping_items_set_updated_at
  before update on public.clipping_items
  for each row execute function public.set_updated_at();

create index clipping_items_designer_idx
  on public.clipping_items (designer_id, created_at desc)
  where deleted_at is null;
create index clipping_items_studio_idx
  on public.clipping_items (studio_id, created_at desc)
  where deleted_at is null;
create index clipping_items_clipper_idx
  on public.clipping_items (clipper_user_id, created_at desc)
  where deleted_at is null;
create index clipping_items_project_idx
  on public.clipping_items (project_id)
  where deleted_at is null;
create index clipping_items_catalog_idx
  on public.clipping_items (catalog_product_id)
  where catalog_product_id is not null;
create index clipping_items_scrape_status_idx
  on public.clipping_items (scrape_status)
  where scrape_status <> 'complete';
create index clipping_items_week_idx
  on public.clipping_items (designer_id, week_added);

-- Dedup helper: one row per (designer_id, clipper_user_id, source_url)
-- among non-deleted rows. The clip route also checks this in code to
-- return the existing row with an "already_saved" status instead of
-- hitting a unique-violation error path. Partial-unique so a previously
-- soft-deleted row can be re-clipped.
create unique index clipping_items_dedup_idx
  on public.clipping_items (clipper_user_id, source_url)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS — studio-wide read, author-only write/delete.
-- ---------------------------------------------------------------------------

alter table public.clipping_items enable row level security;
alter table public.clipping_items force row level security;

-- Studio-wide read: any teammate of the studio owner can SELECT every
-- non-deleted row whose designer_id is in the caller's accessible set.
create policy clipping_items_select_team on public.clipping_items
  for select
  using (
    designer_id in (select public.current_designer_ids())
    and deleted_at is null
  );

-- Insert: same studio. The route also forces clipper_user_id to the
-- caller's users.id so we don't trust a client-supplied value.
create policy clipping_items_insert_team on public.clipping_items
  for insert
  with check (designer_id in (select public.current_designer_ids()));

-- Update / delete: only the author. We still scope by designer_id so a
-- caller can't reach into another studio that happens to share a user.
-- The route uses soft delete via UPDATE.
create policy clipping_items_update_own on public.clipping_items
  for update
  using (
    designer_id in (select public.current_designer_ids())
    and clipper_user_id = public.current_designer_id()
  )
  with check (
    designer_id in (select public.current_designer_ids())
    and clipper_user_id = public.current_designer_id()
  );

create policy clipping_items_delete_own on public.clipping_items
  for delete
  using (
    designer_id in (select public.current_designer_ids())
    and clipper_user_id = public.current_designer_id()
  );

-- Grants follow the default privileges set in 20260501000003_grants.sql.

-- Initial schema for hejmae interior-design platform.
--
-- Conventions:
--   * UUID v4 primary keys (gen_random_uuid()).
--   * Money is stored as BIGINT cents (USD assumed for v1). Never floats.
--   * Every tenant-scoped row carries a denormalized designer_id for fast RLS.
--   * Timestamps are TIMESTAMPTZ. created_at/updated_at on every mutable table.
--   * Soft references to Clerk users via users.clerk_user_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type pricing_mode as enum ('retail', 'cost_plus');

create type project_status as enum ('active', 'completed', 'archived');

create type item_status as enum (
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed'
);

create type proposal_status as enum (
  'draft',
  'sent',
  'partially_approved',
  'fully_approved'
);

create type invoice_type as enum ('deposit', 'progress', 'final');

create type invoice_status as enum (
  'draft',
  'sent',
  'partially_paid',
  'paid'
);

create type po_status as enum (
  'draft',
  'sent',
  'acknowledged',
  'partially_received',
  'complete'
);

create type actor_type as enum ('designer', 'client');

-- ---------------------------------------------------------------------------
-- Reusable updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users (designers). Identity is owned by Clerk; we mirror.
-- ---------------------------------------------------------------------------

create table public.users (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text unique not null,
  email           text unique not null,
  name            text,
  studio_name     text,
  logo_url        text,
  brand_color     text,
  stripe_account_id text unique,
  pricing_mode    pricing_mode not null default 'cost_plus',
  default_markup_percent numeric(6,3) not null default 30.000
    check (default_markup_percent >= 0 and default_markup_percent <= 1000),
  timezone        text default 'America/New_York',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create index users_clerk_user_id_idx on public.users (clerk_user_id);

-- ---------------------------------------------------------------------------
-- Clients (designer's clients)
-- ---------------------------------------------------------------------------

create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  name            text not null,
  email           text,
  phone           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create index clients_designer_idx on public.clients (designer_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  name            text not null,
  status          project_status not null default 'active',
  budget_cents    bigint check (budget_cents is null or budget_cents >= 0),
  location        text,
  notes           text,
  floor_plan_url  text,
  pricing_mode    pricing_mode not null default 'cost_plus',
  markup_percent  numeric(6,3) not null default 30.000
    check (markup_percent >= 0 and markup_percent <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index projects_designer_idx on public.projects (designer_id);
create index projects_client_idx on public.projects (client_id);
create index projects_status_idx on public.projects (status);

-- ---------------------------------------------------------------------------
-- Rooms (per-project, may carry floor-plan rectangle coords)
-- ---------------------------------------------------------------------------

create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,
  -- floor-plan rectangle in image coordinates (pixels or 0..1, decided by FE)
  floor_plan_x      numeric,
  floor_plan_y      numeric,
  floor_plan_width  numeric,
  floor_plan_height numeric,
  position          int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create index rooms_project_idx on public.rooms (project_id);
create index rooms_designer_idx on public.rooms (designer_id);

-- ---------------------------------------------------------------------------
-- Catalog products (shared "master catalog")
-- ---------------------------------------------------------------------------

create table public.catalog_products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  vendor          text,
  category        text,
  retail_price_cents bigint check (retail_price_cents is null or retail_price_cents >= 0),
  retail_price_last_seen_at timestamptz,
  source_url      text,
  image_url       text,
  style_tags      text[] not null default '{}',
  clipped_count   int not null default 1,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger catalog_products_set_updated_at
  before update on public.catalog_products
  for each row execute function public.set_updated_at();

-- Dedup signal: source_url uniquely identifies a product when present.
create unique index catalog_products_source_url_uniq
  on public.catalog_products (source_url)
  where source_url is not null;

create index catalog_products_vendor_name_idx
  on public.catalog_products (lower(coalesce(vendor, '')), lower(name));

create index catalog_products_style_tags_idx
  on public.catalog_products using gin (style_tags);

-- ---------------------------------------------------------------------------
-- Items (project-specific specifications)
-- ---------------------------------------------------------------------------

create table public.items (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  room_id         uuid references public.rooms(id) on delete set null,
  catalog_product_id uuid references public.catalog_products(id) on delete set null,

  name            text not null,
  vendor          text,
  image_url       text,
  source_url      text,

  trade_price_cents  bigint not null default 0
    check (trade_price_cents >= 0),
  retail_price_cents bigint check (retail_price_cents is null or retail_price_cents >= 0),
  client_price_cents bigint not null default 0
    check (client_price_cents >= 0),

  quantity        int not null default 1 check (quantity > 0),
  status          item_status not null default 'sourcing',

  floor_plan_pin_x numeric,
  floor_plan_pin_y numeric,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create index items_project_idx on public.items (project_id);
create index items_designer_idx on public.items (designer_id);
create index items_room_idx on public.items (room_id);
create index items_status_idx on public.items (status);
create index items_catalog_idx on public.items (catalog_product_id);

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------

create table public.proposals (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  status          proposal_status not null default 'draft',
  -- Magic-link token: opaque, high-entropy, never logged.
  magic_link_token text unique,
  magic_link_revoked_at timestamptz,
  sent_at         timestamptz,
  client_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

create index proposals_project_idx on public.proposals (project_id);
create index proposals_designer_idx on public.proposals (designer_id);

create table public.proposal_rooms (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  proposal_id     uuid not null references public.proposals(id) on delete cascade,
  room_id         uuid not null references public.rooms(id) on delete cascade,
  approved_at     timestamptz,
  client_comment  text,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (proposal_id, room_id)
);

create trigger proposal_rooms_set_updated_at
  before update on public.proposal_rooms
  for each row execute function public.set_updated_at();

create index proposal_rooms_proposal_idx on public.proposal_rooms (proposal_id);
create index proposal_rooms_designer_idx on public.proposal_rooms (designer_id);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  type            invoice_type not null default 'progress',
  status          invoice_status not null default 'draft',
  total_cents     bigint not null default 0 check (total_cents >= 0),
  -- Stripe references — Connect direct charges, so payment_intent lives on the
  -- designer's connected account, not the platform. Track both for ops.
  stripe_payment_intent_id text,
  stripe_account_id text,
  -- Magic-link token to allow client to view / pay without an account.
  magic_link_token text unique,
  magic_link_revoked_at timestamptz,
  sent_at         timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index invoices_project_idx on public.invoices (project_id);
create index invoices_designer_idx on public.invoices (designer_id);
create index invoices_status_idx on public.invoices (status);
create index invoices_payment_intent_idx on public.invoices (stripe_payment_intent_id);

create table public.invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  item_id         uuid references public.items(id) on delete set null,
  description     text not null,
  quantity        int not null default 1 check (quantity > 0),
  -- Client-facing pricing only — never store trade price on a client artifact.
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_price_cents bigint not null check (total_price_cents >= 0),
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger invoice_line_items_set_updated_at
  before update on public.invoice_line_items
  for each row execute function public.set_updated_at();

create index invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id);
create index invoice_line_items_designer_idx on public.invoice_line_items (designer_id);

-- ---------------------------------------------------------------------------
-- Payments (received against invoices)
-- ---------------------------------------------------------------------------

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  amount_cents    bigint not null check (amount_cents >= 0),
  -- Stripe Connect: charge IDs on connected account.
  stripe_charge_id text unique,
  stripe_payment_intent_id text,
  -- Platform fee (0.1% of processed volume) tracked here for finance rollups.
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  received_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_designer_idx on public.payments (designer_id);

-- ---------------------------------------------------------------------------
-- Purchase Orders
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  vendor_name     text not null,
  vendor_email    text,
  status          po_status not null default 'draft',
  expected_lead_time_days int check (expected_lead_time_days is null or expected_lead_time_days >= 0),
  sent_at         timestamptz,
  pdf_url         text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create index purchase_orders_project_idx on public.purchase_orders (project_id);
create index purchase_orders_designer_idx on public.purchase_orders (designer_id);

create table public.purchase_order_line_items (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  po_id           uuid not null references public.purchase_orders(id) on delete cascade,
  item_id         uuid references public.items(id) on delete set null,
  description     text not null,
  quantity        int not null default 1 check (quantity > 0),
  -- Trade pricing on the PO is internal — vendor-facing, never client-facing.
  trade_price_cents       bigint not null check (trade_price_cents >= 0),
  total_trade_price_cents bigint not null check (total_trade_price_cents >= 0),
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger po_line_items_set_updated_at
  before update on public.purchase_order_line_items
  for each row execute function public.set_updated_at();

create index po_line_items_po_idx on public.purchase_order_line_items (po_id);
create index po_line_items_designer_idx on public.purchase_order_line_items (designer_id);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------

create table public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  actor_type      actor_type not null,
  actor_id        uuid,
  event_type      text not null,
  description     text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index activity_logs_project_idx on public.activity_logs (project_id, created_at desc);
create index activity_logs_designer_idx on public.activity_logs (designer_id);

-- ---------------------------------------------------------------------------
-- Stripe webhook event log (idempotency for webhook handler)
-- ---------------------------------------------------------------------------

create table public.stripe_events (
  id              text primary key,         -- Stripe event id (evt_…)
  type            text not null,
  account_id      text,                     -- connected account, if Connect event
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

create index stripe_events_account_idx on public.stripe_events (account_id);
create index stripe_events_type_idx on public.stripe_events (type);

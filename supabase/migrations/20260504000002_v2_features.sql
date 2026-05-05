-- V2 features: PO tracking columns, time tracking, multi-user studios.
--
-- This migration is intentionally additive — none of the existing tenant
-- schema (designer_id columns, RLS policies) changes here. Multi-user
-- semantics (team members seeing each other's data) is a phase-2 change
-- that requires updating the RLS helper to expand to all studio members.

-- ===========================================================================
-- 1. PURCHASE ORDER TRACKING
-- ===========================================================================
-- Vendor lead-time tracking + delivery status. POs already had
-- expected_lead_time_days and pdf_url; we now add ship/delivery dates plus
-- a tracking number/URL.
alter table public.purchase_orders
  add column if not exists expected_delivery_date date,
  add column if not exists shipped_at        timestamptz,
  add column if not exists delivered_at      timestamptz,
  add column if not exists tracking_number   text,
  add column if not exists tracking_url      text;

create index if not exists purchase_orders_expected_delivery_idx
  on public.purchase_orders (expected_delivery_date);
create index if not exists purchase_orders_delivered_at_idx
  on public.purchase_orders (delivered_at);

-- ===========================================================================
-- 2. TIME TRACKING
-- ===========================================================================
-- A simple time-entry log. Each entry belongs to a project (and through it,
-- a designer). Hourly rate is snapshotted at log time so changing the
-- designer's rate later doesn't retroactively rebill.
create table if not exists public.time_entries (
  id                 uuid primary key default gen_random_uuid(),
  designer_id        uuid not null references public.users(id) on delete cascade,
  project_id         uuid not null references public.projects(id) on delete cascade,
  -- The team member who logged the time. For phase-1 (single-user studios)
  -- this equals designer_id. Once multi-user is fully wired, this is the
  -- specific member. Nullable so deleted-member entries still aggregate.
  user_id            uuid references public.users(id) on delete set null,
  description        text not null,
  started_at         timestamptz not null,
  ended_at           timestamptz,
  -- Duration in minutes. Computed when ended_at is set; NULL means an open
  -- (running) timer.
  duration_minutes   integer check (duration_minutes is null or duration_minutes >= 0),
  hourly_rate_cents  bigint not null default 0
    check (hourly_rate_cents >= 0),
  billable           boolean not null default true,
  -- Once an entry has been included on an invoice, link it back so we don't
  -- double-bill. Nullable: set when invoiced.
  invoice_line_item_id uuid references public.invoice_line_items(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

create index if not exists time_entries_designer_idx
  on public.time_entries (designer_id);
create index if not exists time_entries_project_idx
  on public.time_entries (project_id);
create index if not exists time_entries_billable_unbilled_idx
  on public.time_entries (project_id, billable)
  where invoice_line_item_id is null;
create index if not exists time_entries_user_idx
  on public.time_entries (user_id);

-- Default hourly rate on the user (studio level). Existing rows get 0.
alter table public.users
  add column if not exists default_hourly_rate_cents bigint not null default 0
    check (default_hourly_rate_cents >= 0);

-- ===========================================================================
-- 3. STUDIOS / TEAM MEMBERS / INVITES (foundation; phase 1)
-- ===========================================================================
-- A studio groups multiple users. For now, every existing user gets their
-- own one-person studio. The tenant column on data tables (designer_id)
-- keeps its current semantics — we'll switch to studio_id-based access in
-- a phase-2 migration after the UI for inviting/joining stabilizes.

create table if not exists public.studios (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger studios_set_updated_at
  before update on public.studios
  for each row execute function public.set_updated_at();

create index if not exists studios_owner_idx on public.studios (owner_user_id);

create type studio_role as enum ('owner', 'admin', 'member');

create table if not exists public.studio_members (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         studio_role not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (studio_id, user_id)
);

create index if not exists studio_members_user_idx
  on public.studio_members (user_id);

-- Invites — pending until accepted. Token used in the accept-invite link.
create table if not exists public.studio_invites (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios(id) on delete cascade,
  email        text not null,
  role         studio_role not null default 'member',
  token        text unique not null,
  invited_by   uuid references public.users(id) on delete set null,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  revoked_at   timestamptz
);

create index if not exists studio_invites_studio_idx
  on public.studio_invites (studio_id);
create index if not exists studio_invites_email_idx
  on public.studio_invites (lower(email));

-- Backfill: every existing user gets a studio of one.
insert into public.studios (id, name, owner_user_id, created_at, updated_at)
select gen_random_uuid(),
       coalesce(u.studio_name, u.name, u.email) || ' — studio',
       u.id, u.created_at, now()
from public.users u
where not exists (
  select 1 from public.studios s where s.owner_user_id = u.id
);

insert into public.studio_members (studio_id, user_id, role, joined_at)
select s.id, s.owner_user_id, 'owner', s.created_at
from public.studios s
where not exists (
  select 1 from public.studio_members m
  where m.studio_id = s.id and m.user_id = s.owner_user_id
);

-- ===========================================================================
-- 4. RLS for the new tables
-- ===========================================================================
alter table public.time_entries    enable row level security;
alter table public.studios         enable row level security;
alter table public.studio_members  enable row level security;
alter table public.studio_invites  enable row level security;

alter table public.time_entries    force row level security;
alter table public.studios         force row level security;
alter table public.studio_members  force row level security;
alter table public.studio_invites  force row level security;

-- time_entries: same designer_id-based pattern as the rest of the schema.
do $$
declare s text;
begin
  for s in select unnest(array['select','insert','update','delete']) loop
    execute format($f$
      drop policy if exists time_entries_%I_own on public.time_entries;
    $f$, s);
  end loop;
end $$;

create policy time_entries_select_own on public.time_entries
  for select using (designer_id = public.current_designer_id());
create policy time_entries_insert_own on public.time_entries
  for insert with check (designer_id = public.current_designer_id());
create policy time_entries_update_own on public.time_entries
  for update using (designer_id = public.current_designer_id())
  with check (designer_id = public.current_designer_id());
create policy time_entries_delete_own on public.time_entries
  for delete using (designer_id = public.current_designer_id());

-- studios: visible if you own or belong to it.
create policy studios_select_member on public.studios
  for select using (
    owner_user_id = public.current_designer_id()
    or exists (
      select 1 from public.studio_members m
      where m.studio_id = id
        and m.user_id = public.current_designer_id()
    )
  );
create policy studios_update_owner on public.studios
  for update using (owner_user_id = public.current_designer_id())
  with check (owner_user_id = public.current_designer_id());

-- studio_members: members can see other members; owners/admins can manage.
create policy studio_members_select on public.studio_members
  for select using (
    user_id = public.current_designer_id()
    or exists (
      select 1 from public.studio_members me
      where me.studio_id = studio_id
        and me.user_id = public.current_designer_id()
    )
  );
create policy studio_members_delete_admin on public.studio_members
  for delete using (
    exists (
      select 1 from public.studio_members me
      where me.studio_id = studio_id
        and me.user_id = public.current_designer_id()
        and me.role in ('owner', 'admin')
    )
  );

-- studio_invites: visible to admins of the studio. Inserts/deletes are
-- handled via service role from the API.
create policy studio_invites_select on public.studio_invites
  for select using (
    exists (
      select 1 from public.studio_members me
      where me.studio_id = studio_id
        and me.user_id = public.current_designer_id()
        and me.role in ('owner', 'admin')
    )
  );

-- ===========================================================================
-- 5. Privileges (matches the pattern from 20260501000003_grants.sql)
-- ===========================================================================
grant all on public.time_entries     to service_role;
grant all on public.studios          to service_role;
grant all on public.studio_members   to service_role;
grant all on public.studio_invites   to service_role;
grant select, insert, update, delete on public.time_entries    to authenticated;
grant select, insert, update, delete on public.studios         to authenticated;
grant select, insert, update, delete on public.studio_members  to authenticated;
grant select, insert, update, delete on public.studio_invites  to authenticated;

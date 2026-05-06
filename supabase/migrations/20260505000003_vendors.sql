-- Vendors: per-designer trade-account records.
--
-- Stores the recurring info a designer would otherwise re-type every time
-- they spec something from a vendor (account number, rep contact, default
-- discount, payment terms, lead time). The discount drives auto-populate
-- of trade_price_cents on items, and lead-time/email auto-populate on
-- purchase orders. Auto-populated values are always overrideable on the
-- specific item or PO.
--
-- Tenant scope: designer_id, same as items/projects/POs. Names are unique
-- per designer (case-insensitive) so the auto-populate lookup is
-- deterministic.

create table if not exists public.vendors (
  id                          uuid primary key default gen_random_uuid(),
  designer_id                 uuid not null references public.users(id) on delete cascade,
  name                        text not null,
  -- Trade account
  account_number              text,
  account_email               text,
  contact_name                text,
  contact_email               text,
  contact_phone               text,
  website                     text,
  -- Pricing & ops
  trade_discount_percent      numeric(5,2)
    check (trade_discount_percent is null
      or (trade_discount_percent >= 0 and trade_discount_percent <= 100)),
  default_lead_time_days      integer
    check (default_lead_time_days is null or default_lead_time_days >= 0),
  payment_terms               text,
  shipping_notes              text,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Case-insensitive uniqueness within a designer's tenant.
create unique index if not exists vendors_designer_name_lower_idx
  on public.vendors (designer_id, lower(name));

create index if not exists vendors_designer_idx
  on public.vendors (designer_id);

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — same designer-owned pattern as the rest of the tenant tables.
-- ---------------------------------------------------------------------------
alter table public.vendors enable row level security;
alter table public.vendors force row level security;

drop policy if exists vendors_select_own on public.vendors;
drop policy if exists vendors_insert_own on public.vendors;
drop policy if exists vendors_update_own on public.vendors;
drop policy if exists vendors_delete_own on public.vendors;

create policy vendors_select_own on public.vendors
  for select using (designer_id = public.current_designer_id());
create policy vendors_insert_own on public.vendors
  for insert with check (designer_id = public.current_designer_id());
create policy vendors_update_own on public.vendors
  for update using (designer_id = public.current_designer_id())
  with check (designer_id = public.current_designer_id());
create policy vendors_delete_own on public.vendors
  for delete using (designer_id = public.current_designer_id());

-- The default privileges from 20260501000003_grants.sql cover this table
-- automatically (service_role: all; authenticated: select/insert/update/delete).

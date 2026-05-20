-- Multi-processor payments.
--
-- Replaces the single Stripe-Connect path with a designer-selectable
-- "active payment processor" between Stripe and Helcim. Both can be
-- onboarded simultaneously; one is live at a time.
--
-- Strategy:
--   * payment_processor_accounts holds one row per (designer, processor)
--     with onboarding state + external credentials reference.
--   * users.active_payment_processor names which one new invoices route to.
--   * invoices.processor / processor_payment_id / processor_account_id
--     record which processor settled a given invoice — pinned at payment
--     time so refunds always route through the correct merchant of record,
--     even if the designer toggles processors afterwards.
--
-- The legacy users.stripe_account_id and invoices.stripe_account_id /
-- stripe_payment_intent_id columns are retained read-only for one
-- release so any straggling code path doesn't crash; a follow-up
-- migration drops them once nothing references them.

-- ---------------------------------------------------------------------------
-- payment_processor_accounts
-- ---------------------------------------------------------------------------

create table public.payment_processor_accounts (
  id                   uuid primary key default gen_random_uuid(),
  designer_id          uuid not null references public.users(id) on delete cascade,
  processor            text not null check (processor in ('stripe', 'helcim')),
  status               text not null default 'pending'
                         check (status in ('pending', 'active', 'disabled')),
  external_account_id  text not null,
  -- Non-secret per-processor config (e.g. Helcim merchant id, account flags).
  -- Secrets (API tokens, webhook signing keys) belong in the platform vault,
  -- keyed by id; this column only carries pointers / public identifiers.
  config               jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (designer_id, processor)
);

create trigger payment_processor_accounts_set_updated_at
  before update on public.payment_processor_accounts
  for each row execute function public.set_updated_at();

create index payment_processor_accounts_designer_idx
  on public.payment_processor_accounts (designer_id);

-- ---------------------------------------------------------------------------
-- users.active_payment_processor
-- ---------------------------------------------------------------------------

alter table public.users
  add column active_payment_processor text
    check (active_payment_processor in ('stripe', 'helcim'));

-- ---------------------------------------------------------------------------
-- invoices: processor stamps (pinned at payment time)
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column processor             text
    check (processor in ('stripe', 'helcim')),
  add column processor_payment_id  text,
  add column processor_account_id  text;

create index invoices_processor_payment_idx
  on public.invoices (processor_payment_id);

-- ---------------------------------------------------------------------------
-- Backfill from the legacy single-Stripe world
-- ---------------------------------------------------------------------------

insert into public.payment_processor_accounts
  (designer_id, processor, status, external_account_id)
select id, 'stripe', 'active', stripe_account_id
  from public.users
 where stripe_account_id is not null
on conflict (designer_id, processor) do nothing;

update public.users
   set active_payment_processor = 'stripe'
 where stripe_account_id is not null
   and active_payment_processor is null;

update public.invoices
   set processor            = 'stripe',
       processor_payment_id = stripe_payment_intent_id,
       processor_account_id = stripe_account_id
 where stripe_account_id is not null
   and processor is null;

-- ---------------------------------------------------------------------------
-- RLS — mirror the per-tenant pattern used by other designer-scoped tables.
-- ---------------------------------------------------------------------------

alter table public.payment_processor_accounts enable row level security;
alter table public.payment_processor_accounts force  row level security;

create policy payment_processor_accounts_select_own on public.payment_processor_accounts
  for select using (designer_id = public.current_designer_id());

create policy payment_processor_accounts_insert_own on public.payment_processor_accounts
  for insert with check (designer_id = public.current_designer_id());

create policy payment_processor_accounts_update_own on public.payment_processor_accounts
  for update using (designer_id = public.current_designer_id())
            with check (designer_id = public.current_designer_id());

create policy payment_processor_accounts_delete_own on public.payment_processor_accounts
  for delete using (designer_id = public.current_designer_id());

grant select, insert, update, delete on public.payment_processor_accounts
  to authenticated, service_role;

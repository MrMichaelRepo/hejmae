-- Phase D bookkeeping completion: bank statement import, period locks,
-- and a journal-entry audit trail.
--
-- Bank statement import (CSV → parsed rows → AI-matched proposals → user
-- accepts/rejects). No Plaid/Teller dependency — designer downloads a
-- CSV from their bank and uploads it here. The parser handles Chase,
-- BoA, Amex, and a generic 3-column shape. AI matching reads parsed rows
-- alongside existing expenses/payments to propose matches.
--
-- Period locks block edits to journal entries dated on/before a closed
-- date (the standard "year-end close" hygiene control).
--
-- Journal-entry history: every UPDATE/DELETE on journal_entries or
-- journal_lines snapshots the prior state into journal_entry_history.
-- Append-only; service-role read for the audit-trail report.

-- ---------------------------------------------------------------------------
-- bank_statement_imports — one per file the user uploads.
-- ---------------------------------------------------------------------------

create table public.bank_statement_imports (
  id                uuid primary key default gen_random_uuid(),
  designer_id       uuid not null references public.users(id) on delete cascade,
  -- Optional: which hejmae account this statement covers (the bank or CC
  -- account in the chart of accounts). Pre-selecting lets us scope
  -- matching candidates by account and skip already-reconciled txns.
  account_id        uuid references public.accounts(id) on delete set null,
  -- Source bank — drives the parser. 'generic' fallback handles a basic
  -- date / description / amount CSV.
  source            text not null check (source in ('chase', 'bofa', 'amex', 'generic')),
  filename          text not null,
  uploaded_at       timestamptz not null default now(),
  period_start      date,
  period_end        date,
  row_count         int not null default 0,
  matched_count     int not null default 0,
  status            text not null default 'parsed'
                      check (status in ('parsed', 'matching', 'matched', 'completed', 'failed')),
  ai_error          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger bank_statement_imports_set_updated_at
  before update on public.bank_statement_imports
  for each row execute function public.set_updated_at();

create index bank_statement_imports_designer_idx
  on public.bank_statement_imports (designer_id, uploaded_at desc);

alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_imports force  row level security;

create policy bank_statement_imports_select_own on public.bank_statement_imports
  for select using (designer_id = public.current_designer_id());
create policy bank_statement_imports_insert_own on public.bank_statement_imports
  for insert with check (designer_id = public.current_designer_id());
create policy bank_statement_imports_update_own on public.bank_statement_imports
  for update using (designer_id = public.current_designer_id())
            with check (designer_id = public.current_designer_id());
create policy bank_statement_imports_delete_own on public.bank_statement_imports
  for delete using (designer_id = public.current_designer_id());

grant select, insert, update, delete on public.bank_statement_imports
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- bank_transactions — one row per parsed line. The AI match step writes
-- the proposed link + confidence in-place; user actions (accept/reject)
-- update status and persist a hard link to expenses/payments.
-- ---------------------------------------------------------------------------

create table public.bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  designer_id       uuid not null references public.users(id) on delete cascade,
  import_id         uuid not null references public.bank_statement_imports(id) on delete cascade,
  txn_date          date not null,
  description       text not null,
  -- Signed: negative for outflows (debit on statement), positive for
  -- deposits. Easier than separate debit/credit columns.
  amount_cents      bigint not null,
  -- Bank's running balance if the CSV carries one. Optional.
  balance_cents     bigint,
  -- AI proposal. status='pending' until the user acts on it.
  status            text not null default 'pending'
                      check (status in (
                        'pending', 'matched', 'created_expense', 'created_payment',
                        'ignored', 'split'
                      )),
  proposed_entity_type text check (proposed_entity_type in ('expense', 'payment')),
  proposed_entity_id   uuid,
  proposed_confidence  numeric(3,2) check (proposed_confidence is null or (proposed_confidence >= 0 and proposed_confidence <= 1)),
  proposed_reasoning   text,
  -- Hard link once the user accepts.
  matched_entity_type text check (matched_entity_type in ('expense', 'payment')),
  matched_entity_id   uuid,
  acted_at          timestamptz,
  acted_by_user_id  uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger bank_transactions_set_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

create index bank_transactions_import_idx
  on public.bank_transactions (import_id, txn_date);
create index bank_transactions_designer_status_idx
  on public.bank_transactions (designer_id, status);
create index bank_transactions_matched_idx
  on public.bank_transactions (matched_entity_type, matched_entity_id);

alter table public.bank_transactions enable row level security;
alter table public.bank_transactions force  row level security;

create policy bank_transactions_select_own on public.bank_transactions
  for select using (designer_id = public.current_designer_id());
create policy bank_transactions_insert_own on public.bank_transactions
  for insert with check (designer_id = public.current_designer_id());
create policy bank_transactions_update_own on public.bank_transactions
  for update using (designer_id = public.current_designer_id())
            with check (designer_id = public.current_designer_id());
create policy bank_transactions_delete_own on public.bank_transactions
  for delete using (designer_id = public.current_designer_id());

grant select, insert, update, delete on public.bank_transactions
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- period_locks — close a fiscal period to JE edits.
--
-- A period_locks row says "no JE may be created or modified on or before
-- locked_through_date". The simplest model: at most one active row per
-- designer (latest wins). We don't enforce that here — UI keeps it tidy.
-- ---------------------------------------------------------------------------

create table public.period_locks (
  id                  uuid primary key default gen_random_uuid(),
  designer_id         uuid not null references public.users(id) on delete cascade,
  locked_through_date date not null,
  locked_at           timestamptz not null default now(),
  locked_by_user_id   uuid references public.users(id) on delete set null,
  reason              text,
  created_at          timestamptz not null default now()
);

create index period_locks_designer_idx
  on public.period_locks (designer_id, locked_through_date desc);

alter table public.period_locks enable row level security;
alter table public.period_locks force  row level security;

create policy period_locks_select_own on public.period_locks
  for select using (designer_id = public.current_designer_id());
create policy period_locks_insert_own on public.period_locks
  for insert with check (designer_id = public.current_designer_id());
create policy period_locks_delete_own on public.period_locks
  for delete using (designer_id = public.current_designer_id());

grant select, insert, delete on public.period_locks to authenticated, service_role;

-- Returns the latest locked-through date for a designer, or NULL.
create or replace function public.latest_period_lock(p_designer_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(locked_through_date)
    from public.period_locks
   where designer_id = p_designer_id
$$;

grant execute on function public.latest_period_lock(uuid)
  to authenticated, service_role;

-- Enforcement trigger: refuse INSERT/UPDATE/DELETE on journal_entries whose
-- entry_date is on or before the latest lock. Auto-posted entries (from
-- expenses, mileage, payments) are exempt at the JE level — the source
-- entity's own writes block at the API layer.
create or replace function public.enforce_period_lock_je()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock date;
  v_entry_date date;
  v_designer uuid;
begin
  if tg_op = 'DELETE' then
    v_entry_date := old.entry_date;
    v_designer   := old.designer_id;
  else
    v_entry_date := new.entry_date;
    v_designer   := new.designer_id;
  end if;
  v_lock := public.latest_period_lock(v_designer);
  if v_lock is not null and v_entry_date <= v_lock then
    raise exception 'Cannot modify journal entries on or before locked period (%)', v_lock
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger enforce_period_lock_je_iud
  before insert or update or delete on public.journal_entries
  for each row execute function public.enforce_period_lock_je();

-- ---------------------------------------------------------------------------
-- journal_entry_history — append-only snapshot of every JE / line write.
--
-- Captures the prior state on UPDATE/DELETE. INSERTs are logged too (with
-- prior_state = null) so the trail starts from creation.
-- ---------------------------------------------------------------------------

create table public.journal_entry_history (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null,
  entry_id        uuid not null,
  operation       text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at      timestamptz not null default now(),
  changed_by_user_id uuid references public.users(id) on delete set null,
  -- JSONB snapshot of the row(s) at the moment of write. For JE row
  -- changes we store the JE columns; for line changes we store the line
  -- columns. table_name disambiguates.
  table_name      text not null check (table_name in ('journal_entries', 'journal_lines')),
  prior_state     jsonb,
  new_state       jsonb
);

create index journal_entry_history_entry_idx
  on public.journal_entry_history (entry_id, changed_at desc);
create index journal_entry_history_designer_idx
  on public.journal_entry_history (designer_id, changed_at desc);

alter table public.journal_entry_history enable row level security;
alter table public.journal_entry_history force  row level security;

create policy journal_entry_history_select_own on public.journal_entry_history
  for select using (designer_id = public.current_designer_id());

grant select on public.journal_entry_history to authenticated;
grant select, insert on public.journal_entry_history to service_role;

create or replace function public.snapshot_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.journal_entry_history
    (designer_id, entry_id, operation, table_name, prior_state, new_state)
  values (
    coalesce(new.designer_id, old.designer_id),
    coalesce(new.id, old.id),
    tg_op,
    'journal_entries',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger snapshot_journal_entry_iud
  after insert or update or delete on public.journal_entries
  for each row execute function public.snapshot_journal_entry();

create or replace function public.snapshot_journal_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.journal_entry_history
    (designer_id, entry_id, operation, table_name, prior_state, new_state)
  values (
    coalesce(new.designer_id, old.designer_id),
    coalesce(new.entry_id, old.entry_id),
    tg_op,
    'journal_lines',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger snapshot_journal_line_iud
  after insert or update or delete on public.journal_lines
  for each row execute function public.snapshot_journal_line();

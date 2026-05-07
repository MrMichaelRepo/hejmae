-- Studio bookkeeping: double-entry chart of accounts + journal, plus the
-- two designer-facing inputs that feed it (expenses and mileage).
--
-- Design notes
-- ============
-- 1. Cash basis. We post journal entries when money moves, not when an
--    invoice is issued. That mirrors how nearly every solo studio actually
--    files. Invoices and POs remain operational artifacts; only `payments`,
--    `expenses`, and `mileage_log` produce journal entries.
--
-- 2. Signed `amount_cents` on journal_lines: positive = debit, negative =
--    credit. Sum-to-zero per entry is then a single `sum() = 0` check,
--    enforced by a DEFERRED constraint trigger so multi-line inserts
--    in one transaction validate at commit time.
--
-- 3. `accounts.system_key` is the stable handle the auto-posting code uses
--    to find well-known accounts (`bank`, `stripe_pending`, `stripe_fees`,
--    `design_fees`, `vehicle_expense`, `owners_equity`, …). The user is
--    free to rename or recode the account; the wiring stays put.
--
-- 4. All auto-posting is idempotent: triggers look up an existing journal
--    entry by (source_type, source_id) and rebuild its lines. Re-running
--    the seed or replaying a webhook never duplicates.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type public.account_type as enum
      ('asset', 'liability', 'equity', 'income', 'expense');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'journal_source_type') then
    create type public.journal_source_type as enum
      ('manual', 'expense', 'mileage', 'payment');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Chart of Accounts
-- ---------------------------------------------------------------------------

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  code            text not null,
  name            text not null,
  type            public.account_type not null,
  -- Stable handle for auto-posting to find this account even if the user
  -- renames or recodes it. Null for user-created accounts.
  system_key      text,
  -- Seeded accounts can be renamed but not deleted.
  is_system       boolean not null default false,
  is_active       boolean not null default true,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists accounts_designer_code_idx
  on public.accounts (designer_id, code);
create unique index if not exists accounts_designer_system_key_idx
  on public.accounts (designer_id, system_key)
  where system_key is not null;
create index if not exists accounts_designer_idx
  on public.accounts (designer_id);
create index if not exists accounts_designer_type_idx
  on public.accounts (designer_id, type);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Journal entries (header) and lines (debits/credits)
-- ---------------------------------------------------------------------------

create table if not exists public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  entry_date      date not null,
  memo            text,
  source_type     public.journal_source_type not null default 'manual',
  -- For auto-posted entries, the row in expenses / mileage_log / payments
  -- this entry mirrors. Null for manual entries.
  source_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists journal_entries_source_idx
  on public.journal_entries (designer_id, source_type, source_id)
  where source_id is not null;
create index if not exists journal_entries_designer_date_idx
  on public.journal_entries (designer_id, entry_date desc);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

create table if not exists public.journal_lines (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  entry_id        uuid not null references public.journal_entries(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete restrict,
  -- Optional project attribution for per-project P&L.
  project_id      uuid references public.projects(id) on delete set null,
  -- Signed: positive = debit, negative = credit. Zero is rejected.
  amount_cents    bigint not null check (amount_cents <> 0),
  memo            text,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists journal_lines_entry_idx on public.journal_lines (entry_id);
create index if not exists journal_lines_account_idx on public.journal_lines (designer_id, account_id);
create index if not exists journal_lines_project_idx on public.journal_lines (designer_id, project_id)
  where project_id is not null;

-- Sum-to-zero per entry, enforced at commit time so multi-line inserts can
-- happen one row at a time without tripping the constraint mid-transaction.
create or replace function public.assert_journal_balanced()
returns trigger
language plpgsql
as $$
declare
  bad_entry uuid;
begin
  -- Check both NEW and OLD entry_ids so an UPDATE that moves a line
  -- between entries leaves both source and destination balanced, and a
  -- DELETE catches the entry it removed from. Either may be null
  -- depending on op (DELETE: new is null; INSERT: old is null).
  select entry_id into bad_entry
    from public.journal_lines
   where entry_id in (new.entry_id, old.entry_id)
   group by entry_id
   having sum(amount_cents) <> 0
   limit 1;
  if bad_entry is not null then
    raise exception 'Journal entry % is not balanced (debits must equal credits)', bad_entry
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists journal_lines_balance_check on public.journal_lines;
create constraint trigger journal_lines_balance_check
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.assert_journal_balanced();

-- ---------------------------------------------------------------------------
-- Default chart-of-accounts seeder
-- ---------------------------------------------------------------------------
-- Idempotent: ON CONFLICT (designer_id, code) DO NOTHING. Safe to run on a
-- designer who already has accounts — only fills in the gaps.
--
-- Categories chosen to match Schedule C lines so the CSV export is
-- accountant-ready out of the box. Designers can rename, deactivate, or
-- add their own — but the system_key wiring stays stable.

create or replace function public.seed_default_chart_of_accounts(p_designer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (designer_id, code, name, type, system_key, is_system, description)
  values
    -- Assets
    (p_designer_id, '1000', 'Operating Bank',           'asset',     'bank',                 true, 'Primary studio checking account.'),
    (p_designer_id, '1010', 'Stripe Pending',           'asset',     'stripe_pending',       true, 'Funds collected via Stripe but not yet paid out to your bank.'),
    (p_designer_id, '1100', 'Accounts Receivable',      'asset',     'accounts_receivable',  true, 'Invoiced amounts not yet paid.'),
    -- Liabilities
    (p_designer_id, '2000', 'Accounts Payable',         'liability', 'accounts_payable',     true, 'Vendor amounts owed.'),
    (p_designer_id, '2100', 'Client Deposits Held',     'liability', 'client_deposits',      true, 'Retainers / deposits not yet earned.'),
    (p_designer_id, '2200', 'Sales Tax Payable',        'liability', 'sales_tax_payable',    true, null),
    (p_designer_id, '2300', 'Credit Card',              'liability', 'credit_card',          true, 'Business credit card balance.'),
    -- Equity
    (p_designer_id, '3000', 'Owner''s Equity',          'equity',    'owners_equity',        true, 'Owner contributions and accumulated earnings.'),
    (p_designer_id, '3100', 'Owner''s Draws',           'equity',    'owners_draws',         true, 'Distributions to the owner.'),
    -- Income
    (p_designer_id, '4000', 'Design Fees',              'income',    'design_fees',          true, 'Service revenue from design work.'),
    (p_designer_id, '4100', 'Product Sales',            'income',    'product_sales',        true, 'Markup revenue from goods sold to clients.'),
    (p_designer_id, '4200', 'Reimbursable Income',      'income',    'reimbursable_income',  true, 'Pass-through reimbursements from clients.'),
    -- Expenses
    (p_designer_id, '5000', 'Cost of Goods Sold',       'expense',   'cost_of_goods_sold',   true, 'Vendor cost of items sold to clients.'),
    (p_designer_id, '5100', 'Stripe Fees',              'expense',   'stripe_fees',          true, 'Payment processing fees on collected payments.'),
    (p_designer_id, '6000', 'Advertising',              'expense',   'advertising',          true, null),
    (p_designer_id, '6100', 'Vehicle Expense',          'expense',   'vehicle_expense',      true, 'Mileage deduction (Schedule C line 9).'),
    (p_designer_id, '6200', 'Office Expense',           'expense',   'office_expense',       true, null),
    (p_designer_id, '6300', 'Software & Subscriptions', 'expense',   'software',             true, null),
    (p_designer_id, '6400', 'Professional Services',    'expense',   'professional_services',true, 'Legal, accounting, etc.'),
    (p_designer_id, '6500', 'Travel',                   'expense',   'travel',               true, null),
    (p_designer_id, '6600', 'Meals (50%)',              'expense',   'meals',                true, 'Business meals — generally 50% deductible.'),
    (p_designer_id, '6700', 'Insurance',                'expense',   'insurance',            true, null),
    (p_designer_id, '6800', 'Supplies',                 'expense',   'supplies',              true, null),
    (p_designer_id, '6900', 'Other Expenses',           'expense',   'other_expenses',       true, null)
  on conflict (designer_id, code) do nothing;
end;
$$;

revoke all on function public.seed_default_chart_of_accounts(uuid) from public;
grant execute on function public.seed_default_chart_of_accounts(uuid) to service_role;

-- Auto-seed on new user. Existing users are backfilled at the bottom of
-- this migration.
create or replace function public.seed_accounts_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_chart_of_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists users_seed_accounts on public.users;
create trigger users_seed_accounts
  after insert on public.users
  for each row execute function public.seed_accounts_for_new_user();

-- ---------------------------------------------------------------------------
-- Mileage rates (per-year IRS standard mileage rate)
-- ---------------------------------------------------------------------------
-- Designer-scoped so a designer can override the published rate (e.g. if
-- they're tracking actuals at a different rate). Falls back to the
-- platform default seeded into every designer at create time.

create table if not exists public.mileage_rates (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  year            int not null check (year between 2000 and 2100),
  rate_cents_per_mile  int not null check (rate_cents_per_mile >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists mileage_rates_designer_year_idx
  on public.mileage_rates (designer_id, year);

create trigger mileage_rates_set_updated_at
  before update on public.mileage_rates
  for each row execute function public.set_updated_at();

-- Seed the IRS standard rate for 2024–2026 on user create. Designer can
-- update the row in place if the IRS publishes a different number.
-- Sources: IRS Notice 2024-08 (67¢ for 2024), Notice 2025-05 (70¢ for 2025).
-- 2026 placeholder mirrors 2025 until IRS publishes; designer can edit.
create or replace function public.seed_default_mileage_rates(p_designer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.mileage_rates (designer_id, year, rate_cents_per_mile)
  values
    (p_designer_id, 2024, 67),
    (p_designer_id, 2025, 70),
    (p_designer_id, 2026, 70)
  on conflict (designer_id, year) do nothing;
end;
$$;

revoke all on function public.seed_default_mileage_rates(uuid) from public;
grant execute on function public.seed_default_mileage_rates(uuid) to service_role;

create or replace function public.seed_mileage_rates_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_mileage_rates(new.id);
  return new;
end;
$$;

drop trigger if exists users_seed_mileage_rates on public.users;
create trigger users_seed_mileage_rates
  after insert on public.users
  for each row execute function public.seed_mileage_rates_for_new_user();

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table if not exists public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  designer_id           uuid not null references public.users(id) on delete cascade,
  -- Optional project attribution. Drives per-project P&L when set.
  project_id            uuid references public.projects(id) on delete set null,
  -- The expense category (must be type='expense'). Validated by trigger.
  category_account_id   uuid not null references public.accounts(id) on delete restrict,
  -- What it was paid from (asset like 'bank' or liability like 'credit_card').
  -- Validated by trigger to be type in ('asset','liability').
  payment_account_id    uuid not null references public.accounts(id) on delete restrict,
  expense_date          date not null,
  amount_cents          bigint not null check (amount_cents > 0),
  vendor_name           text,
  description           text,
  -- Storage path inside the `hejmae` bucket. Public URL is derived.
  receipt_path          text,
  receipt_url           text,
  receipt_content_type  text,
  -- Pass-through to client (also drives reimbursable income recognition).
  -- Not auto-posted yet — flag-only for now, surfaced in the per-project
  -- view for the designer to invoice.
  billable_to_client    boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists expenses_designer_date_idx
  on public.expenses (designer_id, expense_date desc);
create index if not exists expenses_project_idx
  on public.expenses (designer_id, project_id) where project_id is not null;
create index if not exists expenses_category_idx
  on public.expenses (designer_id, category_account_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Validate that the chosen accounts make sense (category is an expense
-- account, payment is an asset or liability), and all rows belong to the
-- same designer.
create or replace function public.validate_expense_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat_type   public.account_type;
  pay_type   public.account_type;
  cat_owner  uuid;
  pay_owner  uuid;
begin
  select type, designer_id into cat_type, cat_owner
    from public.accounts where id = new.category_account_id;
  select type, designer_id into pay_type, pay_owner
    from public.accounts where id = new.payment_account_id;
  if cat_owner is null or pay_owner is null then
    raise exception 'Account not found' using errcode = '23503';
  end if;
  if cat_owner <> new.designer_id or pay_owner <> new.designer_id then
    raise exception 'Account does not belong to designer' using errcode = '23514';
  end if;
  if cat_type <> 'expense' then
    raise exception 'category_account_id must reference an expense account (got %)', cat_type
      using errcode = '23514';
  end if;
  if pay_type not in ('asset', 'liability') then
    raise exception 'payment_account_id must reference an asset or liability account (got %)', pay_type
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_validate_accounts on public.expenses;
create trigger expenses_validate_accounts
  before insert or update on public.expenses
  for each row execute function public.validate_expense_accounts();

-- Auto-post to journal: DR category (expense), CR payment_account.
-- For a credit-card expense the credit lands on the credit-card liability
-- account and increases its balance — same accounting either way.
-- Idempotent: rebuild lines on update.
create or replace function public.post_expense_to_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  -- Find or create the entry.
  select id into v_entry_id
    from public.journal_entries
   where designer_id = new.designer_id
     and source_type = 'expense'
     and source_id   = new.id;

  if v_entry_id is null then
    insert into public.journal_entries (designer_id, entry_date, memo, source_type, source_id)
    values (
      new.designer_id,
      new.expense_date,
      coalesce(nullif(new.description, ''), new.vendor_name, 'Expense'),
      'expense',
      new.id
    )
    returning id into v_entry_id;
  else
    update public.journal_entries
       set entry_date = new.expense_date,
           memo = coalesce(nullif(new.description, ''), new.vendor_name, 'Expense'),
           updated_at = now()
     where id = v_entry_id;
    delete from public.journal_lines where entry_id = v_entry_id;
  end if;

  -- DR category, CR payment_account.
  insert into public.journal_lines
    (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
  values
    (new.designer_id, v_entry_id, new.category_account_id, new.project_id,  new.amount_cents, new.vendor_name, 0),
    (new.designer_id, v_entry_id, new.payment_account_id,  new.project_id, -new.amount_cents, new.vendor_name, 1);

  return new;
end;
$$;

drop trigger if exists expenses_post on public.expenses;
create trigger expenses_post
  after insert or update on public.expenses
  for each row execute function public.post_expense_to_journal();

-- Cascade journal cleanup when an expense is deleted.
create or replace function public.unpost_expense_from_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.journal_entries
   where designer_id = old.designer_id
     and source_type = 'expense'
     and source_id   = old.id;
  return old;
end;
$$;

drop trigger if exists expenses_unpost on public.expenses;
create trigger expenses_unpost
  before delete on public.expenses
  for each row execute function public.unpost_expense_from_journal();

-- ---------------------------------------------------------------------------
-- Mileage log
-- ---------------------------------------------------------------------------
-- Mileage is a non-cash expense for a sole proprietor (the car is
-- personal). Convention: DR Vehicle Expense, CR Owner's Equity. The
-- credit captures "owner contributed value to the business" — economically
-- the same shape as a paid-from-personal expense.

create table if not exists public.mileage_log (
  id                    uuid primary key default gen_random_uuid(),
  designer_id           uuid not null references public.users(id) on delete cascade,
  project_id            uuid references public.projects(id) on delete set null,
  trip_date             date not null,
  -- Numeric so 12.4 mi works.
  miles                 numeric(8,2) not null check (miles > 0),
  -- Snapshot of the rate at posting time; survives later rate edits.
  rate_cents_per_mile   int not null check (rate_cents_per_mile >= 0),
  amount_cents          bigint not null check (amount_cents >= 0),
  purpose               text,
  from_location         text,
  to_location           text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists mileage_log_designer_date_idx
  on public.mileage_log (designer_id, trip_date desc);
create index if not exists mileage_log_project_idx
  on public.mileage_log (designer_id, project_id) where project_id is not null;

create trigger mileage_log_set_updated_at
  before update on public.mileage_log
  for each row execute function public.set_updated_at();

-- Fill rate + amount from the per-year mileage_rates row if the caller
-- didn't supply them. Caller can override either; we recompute amount
-- whenever rate or miles changes via a NEW value.
create or replace function public.fill_mileage_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate int;
begin
  if new.rate_cents_per_mile is null or new.rate_cents_per_mile = 0 then
    select rate_cents_per_mile into v_rate
      from public.mileage_rates
     where designer_id = new.designer_id
       and year = extract(year from new.trip_date)::int;
    if v_rate is null then
      raise exception 'No mileage rate configured for designer % year %',
        new.designer_id, extract(year from new.trip_date)::int
        using errcode = '23514';
    end if;
    new.rate_cents_per_mile := v_rate;
  end if;
  -- Always recompute amount from miles * rate, rounded to whole cents.
  new.amount_cents := round(new.miles * new.rate_cents_per_mile);
  return new;
end;
$$;

drop trigger if exists mileage_log_fill on public.mileage_log;
create trigger mileage_log_fill
  before insert or update on public.mileage_log
  for each row execute function public.fill_mileage_amount();

-- Auto-post: DR Vehicle Expense (system_key='vehicle_expense'),
-- CR Owner's Equity (system_key='owners_equity').
create or replace function public.post_mileage_to_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id   uuid;
  v_vehicle_id uuid;
  v_equity_id  uuid;
begin
  if new.amount_cents = 0 then
    -- Nothing to post.
    return new;
  end if;

  select id into v_vehicle_id from public.accounts
   where designer_id = new.designer_id and system_key = 'vehicle_expense';
  select id into v_equity_id  from public.accounts
   where designer_id = new.designer_id and system_key = 'owners_equity';
  if v_vehicle_id is null or v_equity_id is null then
    -- Soft-fail: the COA hasn't been seeded for this designer yet. The
    -- mileage row still saves; ledger backfill can post later.
    return new;
  end if;

  select id into v_entry_id
    from public.journal_entries
   where designer_id = new.designer_id
     and source_type = 'mileage'
     and source_id   = new.id;

  if v_entry_id is null then
    insert into public.journal_entries (designer_id, entry_date, memo, source_type, source_id)
    values (
      new.designer_id,
      new.trip_date,
      coalesce(nullif(new.purpose, ''), 'Mileage'),
      'mileage',
      new.id
    )
    returning id into v_entry_id;
  else
    update public.journal_entries
       set entry_date = new.trip_date,
           memo = coalesce(nullif(new.purpose, ''), 'Mileage'),
           updated_at = now()
     where id = v_entry_id;
    delete from public.journal_lines where entry_id = v_entry_id;
  end if;

  insert into public.journal_lines
    (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
  values
    (new.designer_id, v_entry_id, v_vehicle_id, new.project_id,  new.amount_cents,
     to_char(new.miles, 'FM999990.0') || ' mi @ ' || new.rate_cents_per_mile || '¢', 0),
    (new.designer_id, v_entry_id, v_equity_id,  new.project_id, -new.amount_cents,
     'Owner-paid (personal vehicle)', 1);

  return new;
end;
$$;

drop trigger if exists mileage_log_post on public.mileage_log;
create trigger mileage_log_post
  after insert or update on public.mileage_log
  for each row execute function public.post_mileage_to_journal();

create or replace function public.unpost_mileage_from_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.journal_entries
   where designer_id = old.designer_id
     and source_type = 'mileage'
     and source_id   = old.id;
  return old;
end;
$$;

drop trigger if exists mileage_log_unpost on public.mileage_log;
create trigger mileage_log_unpost
  before delete on public.mileage_log
  for each row execute function public.unpost_mileage_from_journal();

-- ---------------------------------------------------------------------------
-- Payments → journal posting
-- ---------------------------------------------------------------------------
-- Cash receipt via Stripe Connect direct charges:
--   DR Stripe Pending  (gross - fee)
--   DR Stripe Fees     (fee)
--   CR Design Fees     (gross)
-- We post on insert and rebuild on update so retried webhooks stay
-- idempotent.

create or replace function public.post_payment_to_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id   uuid;
  v_pending_id uuid;
  v_fees_id    uuid;
  v_income_id  uuid;
  v_gross      bigint := new.amount_cents;
  v_fee        bigint := coalesce(new.platform_fee_cents, 0);
  v_project    uuid;
begin
  if v_gross <= 0 then
    return new;
  end if;

  select id into v_pending_id from public.accounts
   where designer_id = new.designer_id and system_key = 'stripe_pending';
  select id into v_fees_id    from public.accounts
   where designer_id = new.designer_id and system_key = 'stripe_fees';
  select id into v_income_id  from public.accounts
   where designer_id = new.designer_id and system_key = 'design_fees';
  if v_pending_id is null or v_fees_id is null or v_income_id is null then
    -- COA not seeded yet. Skip; can be backfilled later.
    return new;
  end if;

  select project_id into v_project from public.invoices where id = new.invoice_id;

  select id into v_entry_id
    from public.journal_entries
   where designer_id = new.designer_id
     and source_type = 'payment'
     and source_id   = new.id;

  if v_entry_id is null then
    insert into public.journal_entries (designer_id, entry_date, memo, source_type, source_id)
    values (new.designer_id, new.received_at::date, 'Payment received', 'payment', new.id)
    returning id into v_entry_id;
  else
    update public.journal_entries
       set entry_date = new.received_at::date,
           updated_at = now()
     where id = v_entry_id;
    delete from public.journal_lines where entry_id = v_entry_id;
  end if;

  -- Net to Stripe Pending.
  insert into public.journal_lines
    (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
  values
    (new.designer_id, v_entry_id, v_pending_id, v_project, v_gross - v_fee, 'Net to Stripe', 0);

  -- Fee, only if any.
  if v_fee > 0 then
    insert into public.journal_lines
      (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
    values
      (new.designer_id, v_entry_id, v_fees_id, v_project, v_fee, 'Stripe fee', 1);
  end if;

  -- Income credit.
  insert into public.journal_lines
    (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
  values
    (new.designer_id, v_entry_id, v_income_id, v_project, -v_gross, 'Revenue', 2);

  return new;
end;
$$;

drop trigger if exists payments_post on public.payments;
create trigger payments_post
  after insert or update on public.payments
  for each row execute function public.post_payment_to_journal();

create or replace function public.unpost_payment_from_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.journal_entries
   where designer_id = old.designer_id
     and source_type = 'payment'
     and source_id   = old.id;
  return old;
end;
$$;

drop trigger if exists payments_unpost on public.payments;
create trigger payments_unpost
  before delete on public.payments
  for each row execute function public.unpost_payment_from_journal();

-- ---------------------------------------------------------------------------
-- RLS — tenant-owned, same pattern as the rest of the schema.
-- ---------------------------------------------------------------------------

alter table public.accounts          enable row level security;
alter table public.accounts          force row level security;
alter table public.journal_entries   enable row level security;
alter table public.journal_entries   force row level security;
alter table public.journal_lines     enable row level security;
alter table public.journal_lines     force row level security;
alter table public.expenses          enable row level security;
alter table public.expenses          force row level security;
alter table public.mileage_rates     enable row level security;
alter table public.mileage_rates     force row level security;
alter table public.mileage_log       enable row level security;
alter table public.mileage_log       force row level security;

do $$
declare
  t text;
  tbls text[] := array[
    'accounts',
    'journal_entries',
    'journal_lines',
    'expenses',
    'mileage_rates',
    'mileage_log'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format($f$
      create policy %I on public.%I
        for select using (designer_id = public.current_designer_id());
    $f$, t || '_select_own', t);
    execute format($f$
      create policy %I on public.%I
        for insert with check (designer_id = public.current_designer_id());
    $f$, t || '_insert_own', t);
    execute format($f$
      create policy %I on public.%I
        for update using (designer_id = public.current_designer_id())
        with check (designer_id = public.current_designer_id());
    $f$, t || '_update_own', t);
    execute format($f$
      create policy %I on public.%I
        for delete using (designer_id = public.current_designer_id());
    $f$, t || '_delete_own', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill: seed defaults for every existing user, then post any existing
-- payments that don't have a journal entry yet.
-- ---------------------------------------------------------------------------

do $$
declare
  u record;
begin
  for u in select id from public.users loop
    perform public.seed_default_chart_of_accounts(u.id);
    perform public.seed_default_mileage_rates(u.id);
  end loop;
end $$;

-- Backfill payment journal entries (idempotent — trigger uses upsert
-- semantics via source_id lookup).
do $$
declare
  p record;
begin
  for p in
    select pay.* from public.payments pay
    left join public.journal_entries je
      on je.designer_id = pay.designer_id
     and je.source_type = 'payment'
     and je.source_id   = pay.id
    where je.id is null
  loop
    -- Re-trigger the posting logic with a no-op update.
    update public.payments set amount_cents = amount_cents where id = p.id;
  end loop;
end $$;

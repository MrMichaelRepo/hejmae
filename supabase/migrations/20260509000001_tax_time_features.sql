-- Tax-time features: studio finance settings, Schedule C mapping, 1099
-- vendor tracking, reconciliation status, quarterly estimated taxes,
-- time tracking team-view permission. Plus widens vendors RLS to team.
--
-- Design notes
-- ============
-- 1. Accounting basis lives on `studios` (not on the owner user) — it's a
--    studio-level policy that all team members share. The default report
--    period (fiscal_year_start_month) lives there too. Existing solo
--    studios get sane defaults (cash basis, calendar year).
--
-- 2. Schedule C line is a small enum on `accounts`. Seed mapping covers
--    the default chart we ship; user-renamed accounts keep the line they
--    were seeded with, and custom user accounts default to NULL until the
--    user picks a line. NULL means "uncategorized — won't appear on the
--    Schedule C summary."
--
-- 3. 1099: tax_id and legal_name on vendors. We never store the full TIN
--    on the row a non-finance teammate can read — only the last 4 chars
--    are exposed in the API layer; the full TIN goes in `tax_id_full` and
--    is only readable via a finance-permission-gated endpoint. (Schema-
--    level enforcement would need column-level grants; we're enforcing in
--    code for now and documenting the contract.)
--    Expenses get vendor_id (nullable) so 1099 totals don't depend on
--    fuzzy name matching. Existing rows keep their free-text vendor_name.
--
-- 4. Reconciliation: simple boolean + timestamp on expenses, plus a
--    last_reconciled_through date per account so the user can mark a
--    period as "I tied this account to the bank statement through X."
--
-- 5. Time tracking: add `time:view_all` and `time:log` permissions and
--    confirm RLS already widens to team via current_designer_ids() (it
--    does — added in 20260505000001 line 105).
--
-- 6. Vendors RLS: vendors was created AFTER team_phase2, so it kept the
--    single-user `_select_own` policies. Widen to team so admins can see
--    vendors in the studio.

-- ===========================================================================
-- 1. STUDIOS — accounting basis, fiscal year, tax estimation settings
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'accounting_basis') then
    create type public.accounting_basis as enum ('cash', 'accrual');
  end if;
end $$;

alter table public.studios
  add column if not exists accounting_basis public.accounting_basis
    not null default 'cash',
  -- 1 = January, 7 = July. Most US sole props use calendar year.
  add column if not exists fiscal_year_start_month int
    not null default 1
    check (fiscal_year_start_month between 1 and 12),
  -- For the quarterly estimated taxes screen. All percentages are stored
  -- as numeric(5,2), so 22.00 == 22%.
  add column if not exists estimated_federal_tax_pct numeric(5,2)
    not null default 22.00
    check (estimated_federal_tax_pct >= 0 and estimated_federal_tax_pct <= 100),
  add column if not exists estimated_state_tax_pct numeric(5,2)
    not null default 5.00
    check (estimated_state_tax_pct >= 0 and estimated_state_tax_pct <= 100),
  -- 15.3% SE tax is the published rate; deductible half = 7.65%, so net
  -- effective rate is ~14.13%. We let the user enter the rate they want
  -- to project at; default 14.13.
  add column if not exists estimated_self_employment_tax_pct numeric(5,2)
    not null default 14.13
    check (estimated_self_employment_tax_pct >= 0 and estimated_self_employment_tax_pct <= 100),
  -- Optional state code so the Schedule C export can label the file.
  add column if not exists tax_state_code text
    check (tax_state_code is null or length(tax_state_code) = 2);

-- ===========================================================================
-- 2. ACCOUNTS — Schedule C line mapping
-- ===========================================================================
-- Stored as a free-text "line code" so we can extend without enum churn.
-- Accepted values mirror the lines on Schedule C (Form 1040). NULL means
-- the account is uncategorized for tax purposes.

alter table public.accounts
  add column if not exists schedule_c_line text;

create index if not exists accounts_schedule_c_line_idx
  on public.accounts (designer_id, schedule_c_line)
  where schedule_c_line is not null;

-- Backfill the default chart with sensible Schedule C mappings. Idempotent:
-- only updates rows whose line is currently NULL, so user edits aren't
-- overwritten.
update public.accounts
   set schedule_c_line = case system_key
     when 'design_fees'           then 'gross_receipts'
     when 'product_sales'         then 'gross_receipts'
     when 'reimbursable_income'   then 'gross_receipts'
     when 'cost_of_goods_sold'    then 'cogs'
     when 'stripe_fees'           then 'commissions_fees'
     when 'advertising'           then 'advertising'
     when 'vehicle_expense'       then 'car_truck'
     when 'office_expense'        then 'office'
     when 'software'              then 'office'
     when 'professional_services' then 'legal_professional'
     when 'travel'                then 'travel'
     when 'meals'                 then 'meals'
     when 'insurance'             then 'insurance'
     when 'supplies'              then 'supplies'
     when 'other_expenses'        then 'other'
   end
 where schedule_c_line is null
   and system_key in (
     'design_fees', 'product_sales', 'reimbursable_income',
     'cost_of_goods_sold', 'stripe_fees', 'advertising',
     'vehicle_expense', 'office_expense', 'software',
     'professional_services', 'travel', 'meals',
     'insurance', 'supplies', 'other_expenses'
   );

-- Update the seed function so freshly-provisioned designers get the
-- mapping baked in. Recreating function (CREATE OR REPLACE) — the
-- ON CONFLICT clause is unchanged so re-runs are still idempotent.
create or replace function public.seed_default_chart_of_accounts(p_designer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (designer_id, code, name, type, system_key, is_system, schedule_c_line, description)
  values
    (p_designer_id, '1000', 'Operating Bank',           'asset',     'bank',                 true, null,                  'Primary studio checking account.'),
    (p_designer_id, '1010', 'Stripe Pending',           'asset',     'stripe_pending',       true, null,                  'Funds collected via Stripe but not yet paid out.'),
    (p_designer_id, '1100', 'Accounts Receivable',      'asset',     'accounts_receivable',  true, null,                  'Invoiced amounts not yet paid.'),
    (p_designer_id, '2000', 'Accounts Payable',         'liability', 'accounts_payable',     true, null,                  'Vendor amounts owed.'),
    (p_designer_id, '2100', 'Client Deposits Held',     'liability', 'client_deposits',      true, null,                  'Retainers / deposits not yet earned.'),
    (p_designer_id, '2200', 'Sales Tax Payable',        'liability', 'sales_tax_payable',    true, null,                  null),
    (p_designer_id, '2300', 'Credit Card',              'liability', 'credit_card',          true, null,                  'Business credit card balance.'),
    (p_designer_id, '3000', 'Owner''s Equity',          'equity',    'owners_equity',        true, null,                  'Owner contributions and accumulated earnings.'),
    (p_designer_id, '3100', 'Owner''s Draws',           'equity',    'owners_draws',         true, null,                  'Distributions to the owner.'),
    (p_designer_id, '4000', 'Design Fees',              'income',    'design_fees',          true, 'gross_receipts',      'Service revenue from design work.'),
    (p_designer_id, '4100', 'Product Sales',            'income',    'product_sales',        true, 'gross_receipts',      'Markup revenue from goods sold to clients.'),
    (p_designer_id, '4200', 'Reimbursable Income',      'income',    'reimbursable_income',  true, 'gross_receipts',      'Pass-through reimbursements from clients.'),
    (p_designer_id, '5000', 'Cost of Goods Sold',       'expense',   'cost_of_goods_sold',   true, 'cogs',                'Vendor cost of items sold to clients.'),
    (p_designer_id, '5100', 'Stripe Fees',              'expense',   'stripe_fees',          true, 'commissions_fees',    'Payment processing fees on collected payments.'),
    (p_designer_id, '6000', 'Advertising',              'expense',   'advertising',          true, 'advertising',         null),
    (p_designer_id, '6100', 'Vehicle Expense',          'expense',   'vehicle_expense',      true, 'car_truck',           'Mileage deduction (Schedule C line 9).'),
    (p_designer_id, '6200', 'Office Expense',           'expense',   'office_expense',       true, 'office',              null),
    (p_designer_id, '6300', 'Software & Subscriptions', 'expense',   'software',             true, 'office',              null),
    (p_designer_id, '6400', 'Professional Services',    'expense',   'professional_services',true, 'legal_professional',  'Legal, accounting, etc.'),
    (p_designer_id, '6500', 'Travel',                   'expense',   'travel',               true, 'travel',              null),
    (p_designer_id, '6600', 'Meals (50%)',              'expense',   'meals',                true, 'meals',               'Business meals — generally 50% deductible.'),
    (p_designer_id, '6700', 'Insurance',                'expense',   'insurance',            true, 'insurance',           null),
    (p_designer_id, '6800', 'Supplies',                 'expense',   'supplies',             true, 'supplies',            null),
    (p_designer_id, '6900', 'Other Expenses',           'expense',   'other_expenses',       true, 'other',               null)
  on conflict (designer_id, code) do nothing;
end;
$$;

-- ===========================================================================
-- 3. VENDORS — 1099 fields + widen RLS to team
-- ===========================================================================

alter table public.vendors
  add column if not exists is_1099_eligible boolean not null default false,
  -- Legal name on the W-9. Falls back to `name` if not set.
  add column if not exists legal_name text,
  -- Last 4 chars of TIN/SSN for display. Full TIN lives in tax_id_full and
  -- is only read by finance-permission-gated routes.
  add column if not exists tax_id_last4 text
    check (tax_id_last4 is null or length(tax_id_last4) = 4),
  add column if not exists tax_id_full text,
  -- Address fields needed for 1099-NEC.
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_postal_code text,
  add column if not exists address_country text;

create index if not exists vendors_designer_1099_idx
  on public.vendors (designer_id)
  where is_1099_eligible = true;

-- Widen vendors RLS from designer-only to team-aware (matches other
-- tenant tables). Drops the legacy *_own policies first.
do $$
begin
  drop policy if exists vendors_select_own on public.vendors;
  drop policy if exists vendors_insert_own on public.vendors;
  drop policy if exists vendors_update_own on public.vendors;
  drop policy if exists vendors_delete_own on public.vendors;

  drop policy if exists vendors_select_team on public.vendors;
  drop policy if exists vendors_insert_team on public.vendors;
  drop policy if exists vendors_update_team on public.vendors;
  drop policy if exists vendors_delete_team on public.vendors;

  create policy vendors_select_team on public.vendors
    for select using (designer_id in (select public.current_designer_ids()));
  create policy vendors_insert_team on public.vendors
    for insert with check (designer_id in (select public.current_designer_ids()));
  create policy vendors_update_team on public.vendors
    for update using (designer_id in (select public.current_designer_ids()))
    with check (designer_id in (select public.current_designer_ids()));
  create policy vendors_delete_team on public.vendors
    for delete using (designer_id in (select public.current_designer_ids()));
end $$;

-- ===========================================================================
-- 4. EXPENSES — vendor_id, reconciliation
-- ===========================================================================

alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists reconciled_at timestamptz,
  -- Who reconciled it (audit trail). Nullable; deleting the user keeps the row.
  add column if not exists reconciled_by_user_id uuid references public.users(id) on delete set null;

create index if not exists expenses_designer_vendor_idx
  on public.expenses (designer_id, vendor_id) where vendor_id is not null;
create index if not exists expenses_designer_reconciled_idx
  on public.expenses (designer_id, payment_account_id, reconciled_at);

-- Validate that vendor_id, if set, belongs to the same designer.
create or replace function public.validate_expense_vendor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.vendor_id is null then return new; end if;
  select designer_id into v_owner from public.vendors where id = new.vendor_id;
  if v_owner is null then
    raise exception 'Vendor not found' using errcode = '23503';
  end if;
  if v_owner <> new.designer_id then
    raise exception 'Vendor does not belong to designer' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_validate_vendor on public.expenses;
create trigger expenses_validate_vendor
  before insert or update on public.expenses
  for each row execute function public.validate_expense_vendor();

-- ===========================================================================
-- 5. ACCOUNTS — last reconciled through (per-account, set by user)
-- ===========================================================================

alter table public.accounts
  add column if not exists last_reconciled_through_date date,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists last_reconciled_by_user_id uuid references public.users(id) on delete set null;

-- ===========================================================================
-- 6. ESTIMATED TAX PAYMENTS
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'estimated_tax_jurisdiction') then
    create type public.estimated_tax_jurisdiction as enum ('federal', 'state');
  end if;
end $$;

create table if not exists public.estimated_tax_payments (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  jurisdiction    public.estimated_tax_jurisdiction not null,
  tax_year        int not null check (tax_year between 2000 and 2100),
  -- 1=Q1 (Apr 15), 2=Q2 (Jun 15), 3=Q3 (Sep 15), 4=Q4 (Jan 15 next year).
  quarter         int not null check (quarter between 1 and 4),
  amount_cents    bigint not null check (amount_cents >= 0),
  paid_at         date,
  -- Free-text — confirmation number, reference, or "EFTPS 12345".
  reference       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per (designer, jurisdiction, year, quarter). The user updates
-- the existing row when they pay; pre-creating empty rows is fine.
create unique index if not exists estimated_tax_payments_unique_idx
  on public.estimated_tax_payments (designer_id, jurisdiction, tax_year, quarter);
create index if not exists estimated_tax_payments_year_idx
  on public.estimated_tax_payments (designer_id, tax_year);

create trigger estimated_tax_payments_set_updated_at
  before update on public.estimated_tax_payments
  for each row execute function public.set_updated_at();

alter table public.estimated_tax_payments enable row level security;
alter table public.estimated_tax_payments force row level security;

drop policy if exists estimated_tax_payments_select_team on public.estimated_tax_payments;
drop policy if exists estimated_tax_payments_insert_team on public.estimated_tax_payments;
drop policy if exists estimated_tax_payments_update_team on public.estimated_tax_payments;
drop policy if exists estimated_tax_payments_delete_team on public.estimated_tax_payments;

create policy estimated_tax_payments_select_team on public.estimated_tax_payments
  for select using (designer_id in (select public.current_designer_ids()));
create policy estimated_tax_payments_insert_team on public.estimated_tax_payments
  for insert with check (designer_id in (select public.current_designer_ids()));
create policy estimated_tax_payments_update_team on public.estimated_tax_payments
  for update using (designer_id in (select public.current_designer_ids()))
  with check (designer_id in (select public.current_designer_ids()));
create policy estimated_tax_payments_delete_team on public.estimated_tax_payments
  for delete using (designer_id in (select public.current_designer_ids()));

grant all on public.estimated_tax_payments to service_role;
grant select, insert, update, delete on public.estimated_tax_payments to authenticated;

-- ===========================================================================
-- 7. USERS — weekly capacity for utilization reports
-- ===========================================================================

alter table public.users
  add column if not exists weekly_capacity_minutes int
    not null default 2400  -- 40h
    check (weekly_capacity_minutes >= 0 and weekly_capacity_minutes <= 10080);

-- ===========================================================================
-- 8. NOTES
-- ===========================================================================
-- time_entries already has team RLS via current_designer_ids() (added in
-- 20260505000001 — see the tbls array). The `time:view_all` and
-- `time:log` permissions are enforced in the API layer, not in RLS, since
-- RLS is studio-scoped. Per-member visibility (e.g. a member who can
-- only see their own time) is filtered in the route handler by user_id.

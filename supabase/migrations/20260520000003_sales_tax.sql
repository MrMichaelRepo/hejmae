-- Sales tax tracking on invoices.
--
-- Adds rate + per-line taxable flag + computed tax. Auto-posting of the
-- tax portion is deferred — for v1 the studio remits sales tax by manually
-- posting a JE to the existing `sales_tax_payable` system account, and the
-- liability report rolls up that activity. This keeps the change small
-- enough to backfill safely (every existing invoice has tax_total_cents=0
-- and total_cents stays exactly what it was).
--
-- Rate is stored as basis points (8.25% = 825) to avoid floating-point
-- drift on per-line tax math.

alter table public.invoices
  add column tax_rate_bps    integer not null default 0
    check (tax_rate_bps >= 0 and tax_rate_bps <= 10000),
  add column tax_total_cents bigint  not null default 0
    check (tax_total_cents >= 0),
  add column tax_state_code  text;

alter table public.invoice_line_items
  add column taxable   boolean not null default false,
  add column tax_cents bigint  not null default 0
    check (tax_cents >= 0);

alter table public.studios
  add column default_sales_tax_rate_bps    integer not null default 0
    check (default_sales_tax_rate_bps >= 0 and default_sales_tax_rate_bps <= 10000),
  add column default_sales_tax_state_code  text;

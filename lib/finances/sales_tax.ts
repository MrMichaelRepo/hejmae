// Sales tax liability report.
//
// Per jurisdiction (US state code), over a chosen period:
//   * taxable sales:    sum of taxable line totals on invoices sent in period
//   * exempt sales:     sum of non-taxable line totals
//   * tax collected:    sum of invoice tax_total_cents in period
//   * tax remitted:     sum of debits to the sales_tax_payable system
//                       account in period (since liabilities are credit-
//                       positive, a debit is a remittance / decrease)
//   * outstanding:      tax_collected − tax_remitted within the period
//
// Total outstanding liability across all time is the natural balance of
// the sales_tax_payable account (credit-positive). We report both the
// period-scoped number and the all-time liability so the user can tell
// "what's owed for this quarter?" vs "what's owed total?".
//
// Period selection uses the invoice's effective recognition date —
// sent_at if present, else created_at — matching how AR aging works.

import { supabaseAdmin } from '@/lib/supabase/server'

export interface SalesTaxJurisdictionRow {
  state_code: string | null
  invoice_count: number
  taxable_sales_cents: number
  exempt_sales_cents: number
  tax_collected_cents: number
  // Average effective rate (bps), purely informational — the studio may
  // have multiple rates per state if rules change mid-period.
  avg_rate_bps: number | null
}

export interface SalesTaxReport {
  from: string
  to: string
  rows: SalesTaxJurisdictionRow[]
  totals: {
    invoice_count: number
    taxable_sales_cents: number
    exempt_sales_cents: number
    tax_collected_cents: number
    tax_remitted_cents: number
    period_outstanding_cents: number
    // Sum of all credits minus debits on sales_tax_payable across all time.
    // Liability natural balance = -1 * (debits − credits) where the journal
    // stores debits-positive.
    all_time_liability_cents: number
  }
}

interface InvoiceRowForTax {
  id: string
  tax_rate_bps: number
  tax_total_cents: number
  tax_state_code: string | null
  sent_at: string | null
  created_at: string
}

interface LineRowForTax {
  invoice_id: string
  total_price_cents: number
  taxable: boolean
}

interface JournalLineRow {
  amount_cents: number
}

function effectiveDate(inv: InvoiceRowForTax): string {
  return (inv.sent_at ?? inv.created_at).slice(0, 10)
}

export async function buildSalesTaxReport(
  designerId: string,
  from: string,
  to: string,
): Promise<SalesTaxReport> {
  const sb = supabaseAdmin()

  // 1. Invoices whose effective date falls in the window. We pull a wider
  //    candidate set (anything with non-zero tax or marked taxable) and
  //    filter in-process so we can use effectiveDate() (sent_at OR
  //    created_at). Drafts and voided invoices are excluded — they aren't
  //    "sales" yet / anymore.
  const { data: invoices, error: invErr } = await sb
    .from('invoices')
    .select(
      'id, tax_rate_bps, tax_total_cents, tax_state_code, sent_at, created_at, status',
    )
    .eq('designer_id', designerId)
    .not('status', 'eq', 'draft')
    .not('status', 'eq', 'void')
  if (invErr) throw invErr

  const inWindow: InvoiceRowForTax[] = []
  for (const i of (invoices ?? []) as Array<InvoiceRowForTax & { status: string }>) {
    const d = effectiveDate(i)
    if (d >= from && d <= to) inWindow.push(i)
  }

  // 2. Their lines (for taxable/exempt split).
  let lines: LineRowForTax[] = []
  if (inWindow.length > 0) {
    const { data: lineRows, error: lineErr } = await sb
      .from('invoice_line_items')
      .select('invoice_id, total_price_cents, taxable')
      .in(
        'invoice_id',
        inWindow.map((i) => i.id),
      )
    if (lineErr) throw lineErr
    lines = (lineRows ?? []) as LineRowForTax[]
  }

  // 3. Group by state.
  const byState = new Map<
    string | null,
    {
      invoice_count: number
      taxable_sales_cents: number
      exempt_sales_cents: number
      tax_collected_cents: number
      rate_sum_bps: number
      rate_count: number
    }
  >()
  for (const inv of inWindow) {
    const key = inv.tax_state_code
    const g = byState.get(key) ?? {
      invoice_count: 0,
      taxable_sales_cents: 0,
      exempt_sales_cents: 0,
      tax_collected_cents: 0,
      rate_sum_bps: 0,
      rate_count: 0,
    }
    g.invoice_count++
    g.tax_collected_cents += inv.tax_total_cents
    if (inv.tax_total_cents > 0) {
      g.rate_sum_bps += inv.tax_rate_bps
      g.rate_count++
    }
    byState.set(key, g)
  }
  const lineIdx = new Map<string, LineRowForTax[]>()
  for (const l of lines) {
    const arr = lineIdx.get(l.invoice_id) ?? []
    arr.push(l)
    lineIdx.set(l.invoice_id, arr)
  }
  for (const inv of inWindow) {
    const g = byState.get(inv.tax_state_code)!
    for (const l of lineIdx.get(inv.id) ?? []) {
      if (l.taxable) g.taxable_sales_cents += l.total_price_cents
      else g.exempt_sales_cents += l.total_price_cents
    }
  }
  const rows: SalesTaxJurisdictionRow[] = Array.from(byState.entries())
    .map(([state_code, g]) => ({
      state_code,
      invoice_count: g.invoice_count,
      taxable_sales_cents: g.taxable_sales_cents,
      exempt_sales_cents: g.exempt_sales_cents,
      tax_collected_cents: g.tax_collected_cents,
      avg_rate_bps:
        g.rate_count > 0 ? Math.round(g.rate_sum_bps / g.rate_count) : null,
    }))
    .sort((a, b) => (a.state_code ?? 'zz').localeCompare(b.state_code ?? 'zz'))

  // 4. Remitted in period + all-time liability balance from the
  //    sales_tax_payable system account.
  let tax_remitted_cents = 0
  let all_time_liability_cents = 0
  const { data: acct } = await sb
    .from('accounts')
    .select('id')
    .eq('designer_id', designerId)
    .eq('system_key', 'sales_tax_payable')
    .maybeSingle()
  if (acct) {
    // In-period: debits (positive amount_cents) reduce the liability.
    const { data: periodLines, error: plErr } = await sb
      .from('journal_lines')
      .select(
        'amount_cents, journal_entries!inner(entry_date, designer_id)',
      )
      .eq('designer_id', designerId)
      .eq('account_id', acct.id)
      .gte('journal_entries.entry_date', from)
      .lte('journal_entries.entry_date', to)
    if (plErr) throw plErr
    for (const l of (periodLines ?? []) as JournalLineRow[]) {
      if (l.amount_cents > 0) tax_remitted_cents += l.amount_cents
    }
    // All-time: sum every line, then invert (liabilities are credit-positive).
    const { data: allLines, error: alErr } = await sb
      .from('journal_lines')
      .select('amount_cents')
      .eq('designer_id', designerId)
      .eq('account_id', acct.id)
    if (alErr) throw alErr
    const debitMinusCredit = ((allLines ?? []) as JournalLineRow[]).reduce(
      (a, l) => a + l.amount_cents,
      0,
    )
    all_time_liability_cents = -debitMinusCredit
  }

  const totals = {
    invoice_count: rows.reduce((a, r) => a + r.invoice_count, 0),
    taxable_sales_cents: rows.reduce(
      (a, r) => a + r.taxable_sales_cents,
      0,
    ),
    exempt_sales_cents: rows.reduce((a, r) => a + r.exempt_sales_cents, 0),
    tax_collected_cents: rows.reduce(
      (a, r) => a + r.tax_collected_cents,
      0,
    ),
    tax_remitted_cents,
    period_outstanding_cents:
      rows.reduce((a, r) => a + r.tax_collected_cents, 0) - tax_remitted_cents,
    all_time_liability_cents,
  }

  return { from, to, rows, totals }
}

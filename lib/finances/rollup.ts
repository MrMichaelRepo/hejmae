// Studio finance rollup helpers. Shared between API routes and server pages
// so the same query/calc logic isn't duplicated.
//
// All helpers accept an optional period (from/to) and accounting basis. The
// basis affects ONLY the income side: cash basis recognizes revenue when
// payments are received; accrual basis recognizes when invoices are sent.
// Expenses are always recognized at expense_date (we record what was paid
// when), so the basis is moot there.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { AccountingBasis } from '@/lib/supabase/types'
import { bucketAge, type AgingBuckets } from './period'

export interface PeriodFilter {
  from: string | null
  to: string
  basis: AccountingBasis
}

export interface FinanceSummary {
  total_invoiced_cents: number
  total_received_cents: number
  total_outstanding_cents: number
  total_cogs_cents: number
  total_expenses_cents: number
  // The "revenue" line that drives gross profit / margin. Equals received
  // on cash basis; equals invoiced on accrual basis.
  revenue_cents: number
  gross_profit_cents: number
  gross_margin_pct: number | null
  net_income_cents: number
  aging: AgingBuckets
}

export interface ProjectPL {
  project_id: string
  project_name: string
  status: string
  client_id: string | null
  invoiced_cents: number
  received_cents: number
  cogs_cents: number
  expenses_cents: number
  revenue_cents: number
  gross_profit_cents: number
  margin_pct: number | null
}

function applyDateRange<T extends { gte: (col: string, v: string) => T; lte: (col: string, v: string) => T }>(
  q: T,
  col: string,
  from: string | null,
  to: string,
): T {
  let r = q.lte(col, to)
  if (from) r = r.gte(col, from)
  return r
}

export async function getStudioSummary(
  designerId: string,
  period: PeriodFilter,
): Promise<FinanceSummary> {
  const sb = supabaseAdmin()
  const { from, to, basis } = period

  // Invoices: filter by sent_at on accrual; on cash we still report total_invoiced
  // for a sanity check — but the revenue line uses payments.
  // We pull all invoices and filter in JS so AR aging (point-in-time outstanding
  // as of `to`) can be computed off the same payload.
  const [invoicesRes, paymentsRes, expensesRes] = await Promise.all([
    sb
      .from('invoices')
      .select('id, status, total_cents, sent_at, created_at')
      .eq('designer_id', designerId),
    (() => {
      let q = sb
        .from('payments')
        .select('invoice_id, amount_cents, received_at')
        .eq('designer_id', designerId)
        .lte('received_at', to + 'T23:59:59.999Z')
      if (from) q = q.gte('received_at', from + 'T00:00:00.000Z')
      return q
    })(),
    applyDateRange(
      sb
        .from('expenses')
        .select('amount_cents, category_account_id, accounts:category_account_id(system_key)')
        .eq('designer_id', designerId),
      'expense_date',
      from,
      to,
    ),
  ])

  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const expenses = expensesRes.data ?? []

  // Invoiced in period (accrual revenue): only invoices with sent_at within range.
  const invoicedInPeriod = invoices
    .filter((i) => i.status !== 'draft')
    .filter((i) => {
      const dt = i.sent_at ?? i.created_at
      if (!dt) return false
      const d = dt.slice(0, 10)
      if (d > to) return false
      if (from && d < from) return false
      return true
    })
    .reduce((a, i) => a + i.total_cents, 0)

  const receivedInPeriod = payments.reduce((a, p) => a + p.amount_cents, 0)

  // AR aging: as-of `to`. Outstanding = unpaid portion of every non-draft
  // invoice whose sent_at <= to.
  const allPaymentsRes = await sb
    .from('payments')
    .select('invoice_id, amount_cents, received_at')
    .eq('designer_id', designerId)
    .lte('received_at', to + 'T23:59:59.999Z')
  const allPayments = allPaymentsRes.data ?? []
  const paidByInvoiceAsOf = new Map<string, number>()
  for (const p of allPayments) {
    if (!p.invoice_id) continue
    paidByInvoiceAsOf.set(
      p.invoice_id,
      (paidByInvoiceAsOf.get(p.invoice_id) ?? 0) + p.amount_cents,
    )
  }

  const aging: AgingBuckets = {
    current_cents: 0,
    bucket_31_60_cents: 0,
    bucket_61_90_cents: 0,
    bucket_over_90_cents: 0,
    total_cents: 0,
  }
  const asOf = new Date(to + 'T00:00:00Z').getTime()
  let totalOutstanding = 0
  for (const inv of invoices) {
    if (inv.status === 'draft' || inv.status === 'paid') continue
    const sent = inv.sent_at ?? inv.created_at
    if (!sent) continue
    const sentDay = sent.slice(0, 10)
    if (sentDay > to) continue
    const outstanding = Math.max(
      0,
      inv.total_cents - (paidByInvoiceAsOf.get(inv.id) ?? 0),
    )
    if (outstanding === 0) continue
    totalOutstanding += outstanding
    const days = Math.max(
      0,
      Math.floor((asOf - new Date(sentDay + 'T00:00:00Z').getTime()) / 86_400_000),
    )
    const bucket = bucketAge(days)
    aging[bucket] += outstanding
  }
  aging.total_cents = totalOutstanding

  // COGS: prefer expenses tagged to system_key='cost_of_goods_sold'.
  // Falls back to PO line totals (legacy behavior) when there are no
  // explicit COGS expenses in the window — keeps the studio rollup
  // populated for studios that haven't migrated to journal-tracked COGS yet.
  type ExpRow = {
    amount_cents: number
    accounts: { system_key: string | null } | { system_key: string | null }[] | null
  }
  const cogsFromExpenses = (expenses as ExpRow[])
    .filter((e) => {
      const acc = Array.isArray(e.accounts) ? e.accounts[0] : e.accounts
      return acc?.system_key === 'cost_of_goods_sold'
    })
    .reduce((a, e) => a + e.amount_cents, 0)

  let cogs = cogsFromExpenses
  if (cogs === 0) {
    const { data: poLines } = await applyDateRange(
      sb
        .from('purchase_order_line_items')
        .select('total_trade_price_cents, created_at')
        .eq('designer_id', designerId),
      'created_at',
      from,
      to,
    )
    cogs = poLines?.reduce((a, l) => a + l.total_trade_price_cents, 0) ?? 0
  }

  const totalExpenses = (expenses as ExpRow[]).reduce(
    (a, e) => a + e.amount_cents,
    0,
  )

  const revenue = basis === 'cash' ? receivedInPeriod : invoicedInPeriod
  const grossProfit = revenue - cogs
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null
  const netIncome = revenue - totalExpenses

  return {
    total_invoiced_cents: invoicedInPeriod,
    total_received_cents: receivedInPeriod,
    total_outstanding_cents: aging.total_cents,
    total_cogs_cents: cogs,
    total_expenses_cents: totalExpenses,
    revenue_cents: revenue,
    gross_profit_cents: grossProfit,
    gross_margin_pct: grossMarginPct,
    net_income_cents: netIncome,
    aging,
  }
}

export async function getProjectPL(
  designerId: string,
  period: PeriodFilter,
): Promise<ProjectPL[]> {
  const sb = supabaseAdmin()
  const { from, to, basis } = period

  const { data: projects } = await sb
    .from('projects')
    .select('id, name, status, client_id')
    .eq('designer_id', designerId)
  if (!projects?.length) return []

  // Pull invoices (for both invoiced + matching payments to project).
  const invoicesRes = await sb
    .from('invoices')
    .select('id, project_id, status, total_cents, sent_at, created_at')
    .eq('designer_id', designerId)
  const invoices = invoicesRes.data ?? []

  let paymentsQ = sb
    .from('payments')
    .select('amount_cents, invoice_id, received_at')
    .eq('designer_id', designerId)
    .lte('received_at', to + 'T23:59:59.999Z')
  if (from) paymentsQ = paymentsQ.gte('received_at', from + 'T00:00:00.000Z')
  const paymentsRes = await paymentsQ
  const payments = paymentsRes.data ?? []

  let expensesQ = sb
    .from('expenses')
    .select('project_id, amount_cents, expense_date, accounts:category_account_id(system_key)')
    .eq('designer_id', designerId)
    .lte('expense_date', to)
  if (from) expensesQ = expensesQ.gte('expense_date', from)
  const expensesRes = await expensesQ
  const expenses = expensesRes.data ?? []

  // PO fallback for COGS (same logic as studio summary).
  let polQ = sb
    .from('purchase_order_line_items')
    .select('total_trade_price_cents, purchase_orders!inner(project_id), created_at')
    .eq('designer_id', designerId)
    .lte('created_at', to + 'T23:59:59.999Z')
  if (from) polQ = polQ.gte('created_at', from + 'T00:00:00.000Z')
  const polRes = await polQ
  const poLines = polRes.data ?? []

  const invoiceProject = new Map<string, string | null>()
  for (const i of invoices) invoiceProject.set(i.id, i.project_id)

  type ExpRow = {
    project_id: string | null
    amount_cents: number
    accounts: { system_key: string | null } | { system_key: string | null }[] | null
  }
  type PolRow = {
    total_trade_price_cents: number
    purchase_orders: { project_id: string } | { project_id: string }[] | null
  }

  return projects.map((p) => {
    const invs = invoices.filter((i) => i.project_id === p.id)
    const invoicedInPeriod = invs
      .filter((i) => i.status !== 'draft')
      .filter((i) => {
        const dt = i.sent_at ?? i.created_at
        if (!dt) return false
        const d = dt.slice(0, 10)
        if (d > to) return false
        if (from && d < from) return false
        return true
      })
      .reduce((a, i) => a + i.total_cents, 0)

    const received = payments
      .filter((pm) => pm.invoice_id && invoiceProject.get(pm.invoice_id) === p.id)
      .reduce((a, pm) => a + pm.amount_cents, 0)

    const projExpenses = (expenses as ExpRow[]).filter((e) => e.project_id === p.id)
    const cogsFromExp = projExpenses
      .filter((e) => {
        const acc = Array.isArray(e.accounts) ? e.accounts[0] : e.accounts
        return acc?.system_key === 'cost_of_goods_sold'
      })
      .reduce((a, e) => a + e.amount_cents, 0)
    const projExpensesAll = projExpenses.reduce((a, e) => a + e.amount_cents, 0)
    const cogsFromPo = (poLines as PolRow[])
      .filter((row) => {
        const rel = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders
        return rel?.project_id === p.id
      })
      .reduce((a, l) => a + l.total_trade_price_cents, 0)

    const cogs = cogsFromExp > 0 ? cogsFromExp : cogsFromPo
    const revenue = basis === 'cash' ? received : invoicedInPeriod
    const grossProfit = revenue - cogs
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : null

    return {
      project_id: p.id,
      project_name: p.name,
      status: p.status,
      client_id: p.client_id,
      invoiced_cents: invoicedInPeriod,
      received_cents: received,
      cogs_cents: cogs,
      expenses_cents: projExpensesAll,
      revenue_cents: revenue,
      gross_profit_cents: grossProfit,
      margin_pct: margin,
    }
  })
}

// ----------------------------------------------------------------------
// P&L by account category (income statement, grouped by account)
// ----------------------------------------------------------------------

export interface PLLine {
  account_id: string
  account_code: string
  account_name: string
  schedule_c_line: string | null
  amount_cents: number
}

export interface PLStatement {
  income: PLLine[]
  expenses: PLLine[]
  total_income_cents: number
  total_expenses_cents: number
  net_income_cents: number
}

export async function getPLStatement(
  designerId: string,
  period: PeriodFilter,
): Promise<PLStatement> {
  const sb = supabaseAdmin()
  const { from, to } = period

  // Pull all journal lines for income+expense accounts in window. Income
  // accounts are credit-natural, expense accounts are debit-natural — we
  // negate income amounts so both columns read as positive.
  let q = sb
    .from('journal_lines')
    .select(`
      amount_cents,
      account:accounts!inner(id, code, name, type, schedule_c_line),
      entry:journal_entries!inner(entry_date, designer_id)
    `)
    .eq('designer_id', designerId)
    .lte('entry.entry_date', to)
  if (from) q = q.gte('entry.entry_date', from)
  const { data, error } = await q
  if (error) throw error

  type Row = {
    amount_cents: number
    account: { id: string; code: string; name: string; type: string; schedule_c_line: string | null }
      | { id: string; code: string; name: string; type: string; schedule_c_line: string | null }[]
      | null
  }
  const rows = (data ?? []) as Row[]

  const byAccount = new Map<string, PLLine>()
  for (const r of rows) {
    const acc = Array.isArray(r.account) ? r.account[0] : r.account
    if (!acc) continue
    if (acc.type !== 'income' && acc.type !== 'expense') continue
    const sign = acc.type === 'income' ? -1 : 1 // credit = negative amt; flip for income
    const existing = byAccount.get(acc.id)
    const adjusted = r.amount_cents * sign
    if (existing) {
      existing.amount_cents += adjusted
    } else {
      byAccount.set(acc.id, {
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
        schedule_c_line: acc.schedule_c_line,
        amount_cents: adjusted,
      })
    }
  }

  const all = Array.from(byAccount.values())
  const income = all
    .filter((l) => l.account_code.startsWith('4'))
    .filter((l) => l.amount_cents !== 0)
    .sort((a, b) => a.account_code.localeCompare(b.account_code))
  const expenses = all
    .filter((l) => l.account_code.startsWith('5') || l.account_code.startsWith('6'))
    .filter((l) => l.amount_cents !== 0)
    .sort((a, b) => a.account_code.localeCompare(b.account_code))

  const totalIncome = income.reduce((a, l) => a + l.amount_cents, 0)
  const totalExpenses = expenses.reduce((a, l) => a + l.amount_cents, 0)

  return {
    income,
    expenses,
    total_income_cents: totalIncome,
    total_expenses_cents: totalExpenses,
    net_income_cents: totalIncome - totalExpenses,
  }
}

// ----------------------------------------------------------------------
// Trial balance: sum of debits and credits per account up to `to`.
// ----------------------------------------------------------------------

export interface TrialBalanceLine {
  account_id: string
  account_code: string
  account_name: string
  type: string
  debit_cents: number
  credit_cents: number
}

export interface TrialBalance {
  lines: TrialBalanceLine[]
  total_debits_cents: number
  total_credits_cents: number
}

export async function getTrialBalance(
  designerId: string,
  asOf: string,
): Promise<TrialBalance> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('journal_lines')
    .select(`
      amount_cents,
      account:accounts!inner(id, code, name, type),
      entry:journal_entries!inner(entry_date, designer_id)
    `)
    .eq('designer_id', designerId)
    .lte('entry.entry_date', asOf)
  if (error) throw error

  type Row = {
    amount_cents: number
    account:
      | { id: string; code: string; name: string; type: string }
      | { id: string; code: string; name: string; type: string }[]
      | null
  }
  const rows = (data ?? []) as Row[]

  const byAccount = new Map<string, TrialBalanceLine>()
  for (const r of rows) {
    const acc = Array.isArray(r.account) ? r.account[0] : r.account
    if (!acc) continue
    const cur = byAccount.get(acc.id) ?? {
      account_id: acc.id,
      account_code: acc.code,
      account_name: acc.name,
      type: acc.type,
      debit_cents: 0,
      credit_cents: 0,
    }
    if (r.amount_cents > 0) cur.debit_cents += r.amount_cents
    else cur.credit_cents += -r.amount_cents
    byAccount.set(acc.id, cur)
  }

  const lines = Array.from(byAccount.values())
    .filter((l) => l.debit_cents > 0 || l.credit_cents > 0)
    .sort((a, b) => a.account_code.localeCompare(b.account_code))
  const totalDebits = lines.reduce((a, l) => a + l.debit_cents, 0)
  const totalCredits = lines.reduce((a, l) => a + l.credit_cents, 0)
  return {
    lines,
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
  }
}

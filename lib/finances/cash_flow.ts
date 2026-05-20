// 13-week cash-flow forecast.
//
// Builds a forward-looking weekly grid:
//   * Inflows  — open invoices (by expected pay date), recurring revenue
//   * Outflows — open POs (by expected_delivery_date as a payment proxy
//                until we add explicit expected_payment_date), unpaid
//                expenses with due dates, scheduled estimated-tax payments,
//                recurring expenses
//   * Starting balance — sum of asset accounts with system_key='bank' or
//                'stripe_pending' as of "today".
//
// Heuristic dates when explicit ones are missing:
//   * Invoice: sent_at + 30 days (or created_at + 30) — caller can override.
//   * Estimated tax: due_date (already in schema).
//
// This is the lightweight v1 — no recurring-transactions table yet (that
// arrives with full budgets in Phase E). We just roll up what's already
// in the DB.

import { supabaseAdmin } from '@/lib/supabase/server'

const WEEKS = 13
const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS

function startOfWeekISO(d: Date): Date {
  // Monday-anchored week.
  const day = d.getUTCDay() // 0 (Sun) .. 6 (Sat)
  const diff = (day + 6) % 7 // Mon=0
  const out = new Date(d)
  out.setUTCDate(d.getUTCDate() - diff)
  out.setUTCHours(0, 0, 0, 0)
  return out
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface CashFlowLine {
  date: string
  kind: 'invoice' | 'po' | 'expense_due' | 'tax_due'
  description: string
  source_id: string
  amount_cents: number // positive = inflow, negative = outflow
}

export interface CashFlowWeek {
  weekStart: string
  weekEnd: string
  inflowCents: number
  outflowCents: number
  netCents: number
  endingBalanceCents: number
  lines: CashFlowLine[]
}

export interface CashFlowForecast {
  asOf: string
  startingBalanceCents: number
  weeks: CashFlowWeek[]
}

interface InvoiceRow {
  id: string
  total_cents: number
  sent_at: string | null
  created_at: string
  notes: string | null
}

interface PoRow {
  id: string
  vendor_name: string
  expected_delivery_date: string | null
  notes: string | null
}
interface PoLineRow {
  po_id: string
  total_trade_price_cents: number
}

interface ExpenseDueRow {
  id: string
  expense_date: string
  vendor_name: string | null
  description: string | null
  amount_cents: number
  reconciled_at: string | null
}

interface TaxRow {
  id: string
  due_date: string
  amount_cents: number
  jurisdiction: string
}

interface AccountBalanceRow {
  id: string
  amount_cents: number
  account_id: string
}

interface AccountKeyRow {
  id: string
  system_key: string | null
  type: string
}

async function computeStartingBalance(designerId: string): Promise<number> {
  const sb = supabaseAdmin()
  const { data: accts, error } = await sb
    .from('accounts')
    .select('id, system_key, type')
    .eq('designer_id', designerId)
    .eq('type', 'asset')
  if (error) throw error
  const cashAccountIds = (accts ?? [])
    .filter((a) => {
      const r = a as AccountKeyRow
      return r.system_key === 'bank' || r.system_key === 'stripe_pending'
    })
    .map((a) => (a as AccountKeyRow).id)
  if (cashAccountIds.length === 0) return 0
  const { data: lines, error: lineErr } = await sb
    .from('journal_lines')
    .select('amount_cents, account_id')
    .eq('designer_id', designerId)
    .in('account_id', cashAccountIds)
  if (lineErr) throw lineErr
  return ((lines ?? []) as AccountBalanceRow[]).reduce(
    (a, r) => a + r.amount_cents,
    0,
  )
}

export async function buildCashFlowForecast(
  designerId: string,
): Promise<CashFlowForecast> {
  const sb = supabaseAdmin()
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const start = startOfWeekISO(now)
  const horizonEnd = new Date(start.getTime() + WEEKS * WEEK_MS)

  // Initialize weekly grid.
  const weeks: CashFlowWeek[] = []
  for (let i = 0; i < WEEKS; i++) {
    const ws = new Date(start.getTime() + i * WEEK_MS)
    const we = new Date(ws.getTime() + WEEK_MS - DAY_MS)
    weeks.push({
      weekStart: isoDate(ws),
      weekEnd: isoDate(we),
      inflowCents: 0,
      outflowCents: 0,
      netCents: 0,
      endingBalanceCents: 0,
      lines: [],
    })
  }
  const horizonIso = isoDate(horizonEnd)
  const todayIso = isoDate(now)

  // ---------- Inflows: open invoices ----------
  // Status: 'sent' or 'partially_paid'. Expected pay date = sent_at + 30 days.
  // We pull the invoice + sum of payments to determine outstanding.
  const { data: invRows, error: invErr } = await sb
    .from('invoices')
    .select('id, total_cents, sent_at, created_at, notes, status, payments(amount_cents)')
    .eq('designer_id', designerId)
    .in('status', ['sent', 'partially_paid'])
  if (invErr) throw invErr

  for (const r of invRows ?? []) {
    const inv = r as InvoiceRow & {
      status: string
      payments: Array<{ amount_cents: number }> | null
    }
    const paid = (inv.payments ?? []).reduce((a, p) => a + p.amount_cents, 0)
    const outstanding = inv.total_cents - paid
    if (outstanding <= 0) continue
    const sentBase = inv.sent_at ?? inv.created_at
    const expected = new Date(new Date(sentBase).getTime() + 30 * DAY_MS)
    const expectedIso = isoDate(expected)
    if (expectedIso < todayIso || expectedIso > horizonIso) continue
    addLine(weeks, start, {
      date: expectedIso,
      kind: 'invoice',
      description: `Invoice expected to clear (${inv.id.slice(0, 8)})`,
      source_id: inv.id,
      amount_cents: outstanding,
    })
  }

  // ---------- Outflows: open POs (expected_delivery_date as proxy) ----------
  const { data: poRows, error: poErr } = await sb
    .from('purchase_orders')
    .select('id, vendor_name, expected_delivery_date, notes, status')
    .eq('designer_id', designerId)
    .in('status', ['sent', 'acknowledged', 'partially_received'])
  if (poErr) throw poErr

  const openPoIds = (poRows ?? []).map((r) => (r as PoRow).id)
  let poTotalsById = new Map<string, number>()
  if (openPoIds.length > 0) {
    const { data: poLines, error: poLineErr } = await sb
      .from('purchase_order_line_items')
      .select('po_id, total_trade_price_cents')
      .in('po_id', openPoIds)
    if (poLineErr) throw poLineErr
    for (const r of poLines ?? []) {
      const row = r as PoLineRow
      poTotalsById.set(
        row.po_id,
        (poTotalsById.get(row.po_id) ?? 0) + row.total_trade_price_cents,
      )
    }
  }
  for (const r of poRows ?? []) {
    const po = r as PoRow
    if (!po.expected_delivery_date) continue
    if (po.expected_delivery_date < todayIso || po.expected_delivery_date > horizonIso) continue
    const total = poTotalsById.get(po.id) ?? 0
    if (total <= 0) continue
    addLine(weeks, start, {
      date: po.expected_delivery_date,
      kind: 'po',
      description: `PO to ${po.vendor_name}`,
      source_id: po.id,
      amount_cents: -total,
    })
  }

  // ---------- Outflows: unreconciled expenses dated forward ----------
  // (Used as a stand-in for "bills due" since hejmae doesn't have bills.)
  const { data: futExp, error: expErr } = await sb
    .from('expenses')
    .select('id, expense_date, vendor_name, description, amount_cents, reconciled_at')
    .eq('designer_id', designerId)
    .gte('expense_date', todayIso)
    .lte('expense_date', horizonIso)
  if (expErr) throw expErr
  for (const e of (futExp ?? []) as ExpenseDueRow[]) {
    if (e.reconciled_at) continue
    addLine(weeks, start, {
      date: e.expense_date,
      kind: 'expense_due',
      description:
        e.description ?? e.vendor_name ?? 'Expense (scheduled)',
      source_id: e.id,
      amount_cents: -e.amount_cents,
    })
  }

  // ---------- Outflows: estimated-tax payments ----------
  const { data: taxRows, error: taxErr } = await sb
    .from('estimated_tax_payments')
    .select('id, due_date, amount_cents, jurisdiction, paid_at')
    .eq('designer_id', designerId)
    .gte('due_date', todayIso)
    .lte('due_date', horizonIso)
  if (taxErr) throw taxErr
  for (const t of (taxRows ?? []) as Array<TaxRow & { paid_at: string | null }>) {
    if (t.paid_at) continue
    addLine(weeks, start, {
      date: t.due_date,
      kind: 'tax_due',
      description: `Estimated ${t.jurisdiction} tax payment`,
      source_id: t.id,
      amount_cents: -t.amount_cents,
    })
  }

  // ---------- Roll up week totals + running balance ----------
  const startingBalance = await computeStartingBalance(designerId)
  let running = startingBalance
  for (const w of weeks) {
    w.lines.sort((a, b) => a.date.localeCompare(b.date))
    w.inflowCents = w.lines.reduce(
      (a, l) => a + (l.amount_cents > 0 ? l.amount_cents : 0),
      0,
    )
    w.outflowCents = w.lines.reduce(
      (a, l) => a + (l.amount_cents < 0 ? l.amount_cents : 0),
      0,
    )
    w.netCents = w.inflowCents + w.outflowCents
    running += w.netCents
    w.endingBalanceCents = running
  }

  return {
    asOf: todayIso,
    startingBalanceCents: startingBalance,
    weeks,
  }
}

function addLine(
  weeks: CashFlowWeek[],
  start: Date,
  line: CashFlowLine,
): void {
  const lineDate = new Date(line.date + 'T00:00:00Z').getTime()
  const idx = Math.floor((lineDate - start.getTime()) / WEEK_MS)
  if (idx < 0 || idx >= weeks.length) return
  weeks[idx].lines.push(line)
}

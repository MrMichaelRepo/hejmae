// Historical statement of cash flows (indirect method).
//
// Three sections (the classic accounting layout):
//   * Operating — net income + working-capital changes
//   * Investing — fixed-asset purchases/sales (rare for a design studio;
//                 mostly empty unless equipment was acquired)
//   * Financing — owner contributions / draws / loans
//
// Computation:
//   1. Net income = (sum of income amounts) − (sum of expense amounts)
//      over journal_entries in the window.
//   2. Δ on every non-cash balance-sheet account = (closing balance) −
//      (opening balance). Closing balance = sum of all journal_lines on
//      the account up through `to`. Opening balance = sum through (from − 1d).
//   3. Operating activities = net income + Δ A/R (decrease = source) +
//      Δ A/P (increase = source) + Δ deposits + Δ sales tax payable +
//      Δ credit card. Each Δ is signed by its impact on cash:
//        - liability/equity increase  → +cash
//        - liability/equity decrease  → −cash
//        - non-cash asset increase    → −cash (e.g. AR went up = less cash)
//        - non-cash asset decrease    → +cash
//   4. Investing = Δ on fixed-asset accounts (here approximated as
//      'Other Asset'-style entries; the default CoA has none, so this is
//      usually empty until the studio adds them).
//   5. Financing = Δ on equity accounts (owner's equity, draws).
//   6. Cash check: opening cash + Σ(operating + investing + financing) =
//      closing cash. If it doesn't, something un-balanced posted.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { AccountRow } from '@/lib/supabase/types'

export interface CashFlowLineItem {
  account_id: string | null
  label: string
  amount_cents: number
}

export interface CashFlowSection {
  title: string
  net_cents: number
  lines: CashFlowLineItem[]
}

export interface CashFlowStatement {
  from: string
  to: string
  net_income_cents: number
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  net_change_cents: number
  opening_cash_cents: number
  closing_cash_cents: number
  // Whether the statement reconciles: opening + net_change = closing.
  reconciled: boolean
}

// system_keys whose accounts are *cash*. These are excluded from working-
// capital deltas (they're the bucket we're describing changes to).
const CASH_KEYS = new Set(['bank', 'stripe_pending'])

interface JLRow {
  account_id: string
  amount_cents: number
}

async function balancesByAccount(
  designerId: string,
  throughDate: string,
): Promise<Map<string, number>> {
  // Sum every journal line for the designer with entry_date <= throughDate.
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('journal_lines')
    .select(
      'account_id, amount_cents, journal_entries!inner(entry_date, designer_id)',
    )
    .eq('designer_id', designerId)
    .lte('journal_entries.entry_date', throughDate)
  if (error) throw error
  const out = new Map<string, number>()
  for (const r of (data ?? []) as JLRow[]) {
    out.set(r.account_id, (out.get(r.account_id) ?? 0) + r.amount_cents)
  }
  return out
}

function dayBefore(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Convert a raw (debit-minus-credit) delta on a non-cash balance-sheet
// account into its impact on cash. Works out to `-raw` for both assets
// and liabilities/equity:
//   * AR (asset) goes up → debit posted → raw > 0 → cash *use* (-raw).
//   * AP (liability) goes up → credit posted → raw < 0 → cash *source* (-raw).
function deltaToCashFixed(rawDelta: number): number {
  return -rawDelta
}

export async function buildCashFlowStatement(
  designerId: string,
  from: string,
  to: string,
): Promise<CashFlowStatement> {
  const sb = supabaseAdmin()

  const { data: accts, error: acctErr } = await sb
    .from('accounts')
    .select('*')
    .eq('designer_id', designerId)
  if (acctErr) throw acctErr
  const accounts = (accts ?? []) as AccountRow[]
  const acctById = new Map(accounts.map((a) => [a.id, a]))

  const [opening, closing] = await Promise.all([
    balancesByAccount(designerId, dayBefore(from)),
    balancesByAccount(designerId, to),
  ])

  // Net income = (income lines) - (expense lines) over the period.
  // Income posts as credit (negative raw); expense posts as debit (positive raw).
  // Net income (credit-positive) = -(Σ income raw) - (Σ expense raw)
  //                              = -(Σ all P&L raw)
  // Equivalently: closing − opening on (income + expense) accounts gives raw;
  // negate the income portion and subtract the expense portion. We just sum
  // period activity directly to avoid double-handling.
  const { data: periodLines, error: plErr } = await sb
    .from('journal_lines')
    .select(
      'account_id, amount_cents, journal_entries!inner(entry_date, designer_id)',
    )
    .eq('designer_id', designerId)
    .gte('journal_entries.entry_date', from)
    .lte('journal_entries.entry_date', to)
  if (plErr) throw plErr

  let netIncome = 0
  for (const r of (periodLines ?? []) as JLRow[]) {
    const a = acctById.get(r.account_id)
    if (!a) continue
    if (a.type === 'income') {
      // income natural balance is credit-positive; raw is debit-positive → flip sign
      netIncome += -r.amount_cents
    } else if (a.type === 'expense') {
      netIncome += -r.amount_cents // expense reduces net income (raw is positive on debit)
    }
  }

  // Cash accounts.
  const cashAccountIds = new Set(
    accounts
      .filter((a) => a.system_key && CASH_KEYS.has(a.system_key))
      .map((a) => a.id),
  )
  const openingCash = sumOver(opening, cashAccountIds)
  const closingCash = sumOver(closing, cashAccountIds)

  // Build sections.
  const operating: CashFlowSection = {
    title: 'Operating activities',
    net_cents: netIncome,
    lines: [{ account_id: null, label: 'Net income', amount_cents: netIncome }],
  }
  const investing: CashFlowSection = {
    title: 'Investing activities',
    net_cents: 0,
    lines: [],
  }
  const financing: CashFlowSection = {
    title: 'Financing activities',
    net_cents: 0,
    lines: [],
  }

  for (const a of accounts) {
    if (cashAccountIds.has(a.id)) continue
    if (a.type === 'income' || a.type === 'expense') continue
    const raw = (closing.get(a.id) ?? 0) - (opening.get(a.id) ?? 0)
    if (raw === 0) continue
    const cashImpact = deltaToCashFixed(raw)
    const isFinancing = a.type === 'equity'
    // No fixed-asset accounts in the default CoA. We bucket *all* non-cash
    // assets into "operating" (A/R, deposits-held etc.) unless the user
    // creates a fixed-asset account and codes it manually — those would
    // also currently land in operating. A future refinement: add an
    // `account.subtype = 'fixed_asset'` flag.
    const target = isFinancing ? financing : operating
    target.lines.push({
      account_id: a.id,
      label: `Change in ${a.name}`,
      amount_cents: cashImpact,
    })
    target.net_cents += cashImpact
  }

  const net_change = operating.net_cents + investing.net_cents + financing.net_cents

  return {
    from,
    to,
    net_income_cents: netIncome,
    operating,
    investing,
    financing,
    net_change_cents: net_change,
    opening_cash_cents: openingCash,
    closing_cash_cents: closingCash,
    reconciled: Math.abs(openingCash + net_change - closingCash) <= 1,
  }
}

function sumOver(map: Map<string, number>, ids: Set<string>): number {
  let total = 0
  for (const [k, v] of map) if (ids.has(k)) total += v
  return total
}

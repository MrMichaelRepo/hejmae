// Estimated tax projection: based on YTD net income and the studio's
// configured rates, projects what they'll owe federal+SE+state for the
// year. NOT advice — labeled as projection only.
//
// Calculation:
//   YTD net income (cash basis)  → annualize → × (federal + SE + state)
// Then divide by 4 to get a per-quarter estimated payment.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { StudioFinanceSettings } from './studio_settings'

export interface EstimatedTaxProjection {
  tax_year: number
  ytd_net_income_cents: number
  // Days elapsed in the tax year as-of today. Used to annualize.
  days_elapsed: number
  days_in_year: number
  projected_annual_net_income_cents: number
  projected_federal_tax_cents: number
  projected_self_employment_tax_cents: number
  projected_state_tax_cents: number
  projected_total_tax_cents: number
  per_quarter_estimate_cents: number
  // Q1..Q4 already paid, federal+state combined.
  paid_cents_by_quarter: { 1: number; 2: number; 3: number; 4: number }
  total_paid_cents: number
  remaining_estimate_cents: number
}

const QUARTER_DUE_DATES: Record<number, [number, number]> = {
  1: [3, 15], // Apr 15 (month index 3)
  2: [5, 15], // Jun 15
  3: [8, 15], // Sep 15
  4: [0, 15], // next year Jan 15
}

export function quarterDueDate(year: number, q: number): Date {
  const [m0, d] = QUARTER_DUE_DATES[q]
  const y = q === 4 ? year + 1 : year
  return new Date(Date.UTC(y, m0, d))
}

export async function getEstimatedTaxProjection(
  designerId: string,
  taxYear: number,
  settings: StudioFinanceSettings,
  today: Date = new Date(),
): Promise<EstimatedTaxProjection> {
  const sb = supabaseAdmin()
  const yearStart = `${taxYear}-01-01`
  const yearEnd = `${taxYear}-12-31`

  // YTD net income from journal lines (income - expenses - cogs).
  const { data, error } = await sb
    .from('journal_lines')
    .select(`
      amount_cents,
      account:accounts!inner(type),
      entry:journal_entries!inner(entry_date, designer_id)
    `)
    .eq('designer_id', designerId)
    .gte('entry.entry_date', yearStart)
    .lte('entry.entry_date', yearEnd)
  if (error) throw error

  type Row = {
    amount_cents: number
    account: { type: string } | { type: string }[] | null
  }
  let income = 0
  let expense = 0
  for (const r of (data ?? []) as Row[]) {
    const acc = Array.isArray(r.account) ? r.account[0] : r.account
    if (!acc) continue
    if (acc.type === 'income') income += -r.amount_cents
    else if (acc.type === 'expense') expense += r.amount_cents
  }
  const ytdNet = income - expense

  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const daysInYear = isLeap(taxYear) ? 366 : 365
  const startMs = Date.UTC(taxYear, 0, 1)
  const todayClamped = new Date(
    Math.min(today.getTime(), Date.UTC(taxYear, 11, 31, 23, 59, 59)),
  )
  const daysElapsed = Math.max(
    1,
    Math.floor((todayClamped.getTime() - startMs) / 86_400_000) + 1,
  )

  const projectedAnnual = Math.max(
    0,
    Math.round((ytdNet / daysElapsed) * daysInYear),
  )

  const fed = Math.max(
    0,
    Math.round((projectedAnnual * settings.estimated_federal_tax_pct) / 100),
  )
  const se = Math.max(
    0,
    Math.round(
      (projectedAnnual * settings.estimated_self_employment_tax_pct) / 100,
    ),
  )
  const state = Math.max(
    0,
    Math.round((projectedAnnual * settings.estimated_state_tax_pct) / 100),
  )
  const total = fed + se + state
  const perQ = Math.round(total / 4)

  // Already paid by quarter.
  const { data: paid } = await sb
    .from('estimated_tax_payments')
    .select('quarter, amount_cents')
    .eq('designer_id', designerId)
    .eq('tax_year', taxYear)
    .not('paid_at', 'is', null)

  const paidBy = { 1: 0, 2: 0, 3: 0, 4: 0 } as { 1: number; 2: number; 3: number; 4: number }
  for (const p of paid ?? []) {
    const q = p.quarter as 1 | 2 | 3 | 4
    paidBy[q] += p.amount_cents
  }
  const totalPaid = paidBy[1] + paidBy[2] + paidBy[3] + paidBy[4]

  return {
    tax_year: taxYear,
    ytd_net_income_cents: ytdNet,
    days_elapsed: daysElapsed,
    days_in_year: daysInYear,
    projected_annual_net_income_cents: projectedAnnual,
    projected_federal_tax_cents: fed,
    projected_self_employment_tax_cents: se,
    projected_state_tax_cents: state,
    projected_total_tax_cents: total,
    per_quarter_estimate_cents: perQ,
    paid_cents_by_quarter: paidBy,
    total_paid_cents: totalPaid,
    remaining_estimate_cents: Math.max(0, total - totalPaid),
  }
}

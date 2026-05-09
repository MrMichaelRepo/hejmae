// Schedule C summary: groups expense and income lines by Schedule C line.
//
// Designed for the studio's accountant. Reads from journal_lines so it
// includes everything: expenses + auto-posted COGS + payment-side fees +
// mileage, all classified by the schedule_c_line column on accounts.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { ScheduleCLine } from '@/lib/supabase/types'

export interface ScheduleCRow {
  line: ScheduleCLine | null
  // Each Schedule C "line" has a one- or two-digit IRS line number; we
  // include it for the export header so the CPA doesn't have to look it up.
  irs_line: string
  label: string
  amount_cents: number
  // The accounts that contribute, for drill-down.
  contributing_accounts: Array<{ id: string; code: string; name: string; amount_cents: number }>
}

export interface ScheduleCSummary {
  income_total_cents: number
  cogs_total_cents: number
  expenses_total_cents: number
  // Net = income - cogs - expenses (what the studio reports as Schedule C
  // tentative profit, line 31).
  tentative_profit_cents: number
  rows: ScheduleCRow[]
  // Accounts that have activity but no schedule_c_line set — flagged so
  // the studio can categorize before tax time.
  unmapped: Array<{ id: string; code: string; name: string; type: string; amount_cents: number }>
}

const LINE_LABELS: Record<ScheduleCLine, { irs: string; label: string }> = {
  gross_receipts: { irs: '1', label: 'Gross receipts or sales' },
  returns_allowances: { irs: '2', label: 'Returns and allowances' },
  cogs: { irs: '4 / Part III', label: 'Cost of goods sold' },
  advertising: { irs: '8', label: 'Advertising' },
  car_truck: { irs: '9', label: 'Car and truck expenses' },
  commissions_fees: { irs: '10', label: 'Commissions and fees' },
  contract_labor: { irs: '11', label: 'Contract labor' },
  depletion: { irs: '12', label: 'Depletion' },
  depreciation: { irs: '13', label: 'Depreciation' },
  employee_benefits: { irs: '14', label: 'Employee benefit programs' },
  insurance: { irs: '15', label: 'Insurance (other than health)' },
  interest_mortgage: { irs: '16a', label: 'Interest — mortgage' },
  interest_other: { irs: '16b', label: 'Interest — other' },
  legal_professional: { irs: '17', label: 'Legal and professional services' },
  office: { irs: '18', label: 'Office expense' },
  pension_profit: { irs: '19', label: 'Pension and profit-sharing plans' },
  rent_lease_vehicle: { irs: '20a', label: 'Rent — vehicles, machinery, equipment' },
  rent_lease_other: { irs: '20b', label: 'Rent — other business property' },
  repairs_maintenance: { irs: '21', label: 'Repairs and maintenance' },
  supplies: { irs: '22', label: 'Supplies' },
  taxes_licenses: { irs: '23', label: 'Taxes and licenses' },
  travel: { irs: '24a', label: 'Travel' },
  meals: { irs: '24b', label: 'Meals (50% deductible)' },
  utilities: { irs: '25', label: 'Utilities' },
  wages: { irs: '26', label: 'Wages' },
  other: { irs: '48 (Part V)', label: 'Other expenses' },
}

const LINE_ORDER: ScheduleCLine[] = [
  'gross_receipts',
  'returns_allowances',
  'cogs',
  'advertising',
  'car_truck',
  'commissions_fees',
  'contract_labor',
  'depletion',
  'depreciation',
  'employee_benefits',
  'insurance',
  'interest_mortgage',
  'interest_other',
  'legal_professional',
  'office',
  'pension_profit',
  'rent_lease_vehicle',
  'rent_lease_other',
  'repairs_maintenance',
  'supplies',
  'taxes_licenses',
  'travel',
  'meals',
  'utilities',
  'wages',
  'other',
]

export async function getScheduleCSummary(
  designerId: string,
  taxYear: number,
): Promise<ScheduleCSummary> {
  const sb = supabaseAdmin()
  const yearStart = `${taxYear}-01-01`
  const yearEnd = `${taxYear}-12-31`

  const { data, error } = await sb
    .from('journal_lines')
    .select(`
      amount_cents,
      account:accounts!inner(id, code, name, type, schedule_c_line),
      entry:journal_entries!inner(entry_date, designer_id)
    `)
    .eq('designer_id', designerId)
    .gte('entry.entry_date', yearStart)
    .lte('entry.entry_date', yearEnd)
  if (error) throw error

  type Row = {
    amount_cents: number
    account:
      | { id: string; code: string; name: string; type: string; schedule_c_line: ScheduleCLine | null }
      | { id: string; code: string; name: string; type: string; schedule_c_line: ScheduleCLine | null }[]
      | null
  }
  const rows = (data ?? []) as Row[]

  const byLine = new Map<string, ScheduleCRow>()
  const unmapped = new Map<
    string,
    { id: string; code: string; name: string; type: string; amount_cents: number }
  >()

  for (const r of rows) {
    const acc = Array.isArray(r.account) ? r.account[0] : r.account
    if (!acc) continue
    if (acc.type !== 'income' && acc.type !== 'expense') continue
    const sign = acc.type === 'income' ? -1 : 1
    const adjusted = r.amount_cents * sign

    if (!acc.schedule_c_line) {
      const cur = unmapped.get(acc.id) ?? {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        amount_cents: 0,
      }
      cur.amount_cents += adjusted
      unmapped.set(acc.id, cur)
      continue
    }

    const lineMeta = LINE_LABELS[acc.schedule_c_line]
    const cur =
      byLine.get(acc.schedule_c_line) ??
      ({
        line: acc.schedule_c_line,
        irs_line: lineMeta.irs,
        label: lineMeta.label,
        amount_cents: 0,
        contributing_accounts: [],
      } satisfies ScheduleCRow)
    cur.amount_cents += adjusted
    const accIx = cur.contributing_accounts.findIndex((c) => c.id === acc.id)
    if (accIx >= 0) {
      cur.contributing_accounts[accIx].amount_cents += adjusted
    } else {
      cur.contributing_accounts.push({
        id: acc.id,
        code: acc.code,
        name: acc.name,
        amount_cents: adjusted,
      })
    }
    byLine.set(acc.schedule_c_line, cur)
  }

  const ordered: ScheduleCRow[] = []
  for (const ln of LINE_ORDER) {
    const row = byLine.get(ln)
    if (row && row.amount_cents !== 0) ordered.push(row)
  }

  const incomeRow = byLine.get('gross_receipts')
  const cogsRow = byLine.get('cogs')
  const incomeTotal = incomeRow?.amount_cents ?? 0
  const cogsTotal = cogsRow?.amount_cents ?? 0
  // Returns/allowances reduces income.
  const returnsTotal = byLine.get('returns_allowances')?.amount_cents ?? 0

  const expensesTotal = ordered
    .filter((r) => r.line !== 'gross_receipts' && r.line !== 'returns_allowances' && r.line !== 'cogs')
    .reduce((a, r) => a + r.amount_cents, 0)

  const tentative = incomeTotal - returnsTotal - cogsTotal - expensesTotal

  return {
    income_total_cents: incomeTotal - returnsTotal,
    cogs_total_cents: cogsTotal,
    expenses_total_cents: expensesTotal,
    tentative_profit_cents: tentative,
    rows: ordered,
    unmapped: Array.from(unmapped.values()).filter((u) => u.amount_cents !== 0),
  }
}

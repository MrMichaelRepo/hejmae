import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import { resolveBasis, resolvePeriod } from '@/lib/finances/period'
import { getPLStatement } from '@/lib/finances/rollup'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const settings = await getStudioFinanceSettings(ctx.studioId)
    const period = resolvePeriod({
      searchParams: url.searchParams,
      fiscal_year_start_month: settings.fiscal_year_start_month,
    })
    const basis = resolveBasis(url.searchParams, settings.accounting_basis)
    const pl = await getPLStatement(ctx.designerId, {
      from: period.from,
      to: period.to,
      basis,
    })

    const rows: string[] = []
    rows.push(`Profit & Loss · ${period.label} · ${basis} basis`)
    rows.push('')
    rows.push(csvRow(['Section', 'Code', 'Account', 'Schedule C', 'Amount']))
    for (const l of pl.income) {
      rows.push(csvRow(['Income', l.account_code, l.account_name, l.schedule_c_line ?? '', dollars(l.amount_cents)]))
    }
    rows.push(csvRow(['', '', 'Total income', '', dollars(pl.total_income_cents)]))
    rows.push('')
    for (const l of pl.expenses) {
      rows.push(csvRow(['Expense', l.account_code, l.account_name, l.schedule_c_line ?? '', dollars(l.amount_cents)]))
    }
    rows.push(csvRow(['', '', 'Total expenses', '', dollars(pl.total_expenses_cents)]))
    rows.push('')
    rows.push(csvRow(['', '', 'Net income', '', dollars(pl.net_income_cents)]))

    const filename = `hejmae-profit-loss_${period.from ?? 'all'}_${period.to}_${basis}.csv`
    return csvResponse(filename, csvBody(rows))
  })
}

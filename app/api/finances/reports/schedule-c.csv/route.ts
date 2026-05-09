import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { getScheduleCSummary } from '@/lib/finances/schedule_c'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const yr = parseInt(url.searchParams.get('year') ?? '', 10)
    const taxYear = Number.isFinite(yr) ? yr : new Date().getUTCFullYear()
    const summary = await getScheduleCSummary(ctx.designerId, taxYear)

    const rows: string[] = []
    rows.push(`Schedule C summary · Tax year ${taxYear}`)
    rows.push('')
    rows.push(csvRow(['IRS line', 'Description', 'Contributing accounts', 'Amount']))
    for (const r of summary.rows) {
      const accs = r.contributing_accounts.map((a) => `${a.code} ${a.name}`).join('; ')
      rows.push(csvRow([r.irs_line, r.label, accs, dollars(r.amount_cents)]))
    }
    rows.push('')
    rows.push(csvRow(['', 'Gross receipts (income)', '', dollars(summary.income_total_cents)]))
    rows.push(csvRow(['', 'COGS', '', dollars(summary.cogs_total_cents)]))
    rows.push(csvRow(['', 'Total expenses (lines 8–27)', '', dollars(summary.expenses_total_cents)]))
    rows.push(csvRow(['', 'Tentative profit (line 31)', '', dollars(summary.tentative_profit_cents)]))

    if (summary.unmapped.length > 0) {
      rows.push('')
      rows.push('Unmapped accounts (categorize on Chart of accounts)')
      rows.push(csvRow(['Code', 'Account', 'Type', 'Amount']))
      for (const u of summary.unmapped) {
        rows.push(csvRow([u.code, u.name, u.type, dollars(u.amount_cents)]))
      }
    }

    return csvResponse(`hejmae-schedule-c_${taxYear}.csv`, csvBody(rows))
  })
}

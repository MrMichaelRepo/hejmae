import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { getTrialBalance } from '@/lib/finances/rollup'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const asOf = url.searchParams.get('as_of') ?? new Date().toISOString().slice(0, 10)
    const tb = await getTrialBalance(ctx.designerId, asOf)
    const rows: string[] = []
    rows.push(`Trial balance · As of ${asOf}`)
    rows.push('')
    rows.push(csvRow(['Code', 'Account', 'Type', 'Debit', 'Credit']))
    for (const l of tb.lines) {
      rows.push(csvRow([l.account_code, l.account_name, l.type, dollars(l.debit_cents), dollars(l.credit_cents)]))
    }
    rows.push('')
    rows.push(csvRow(['', 'Total', '', dollars(tb.total_debits_cents), dollars(tb.total_credits_cents)]))
    return csvResponse(`hejmae-trial-balance_${asOf}.csv`, csvBody(rows))
  })
}

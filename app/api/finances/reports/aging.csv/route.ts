import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { getAgingDetail } from '@/lib/finances/aging'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

const BUCKET_LABEL: Record<string, string> = {
  current_cents: 'Current (0–30)',
  bucket_31_60_cents: '31–60',
  bucket_61_90_cents: '61–90',
  bucket_over_90_cents: 'Over 90',
}

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const asOf = url.searchParams.get('as_of') ?? new Date().toISOString().slice(0, 10)
    const rows = await getAgingDetail(ctx.designerId, asOf)
    const out: string[] = []
    out.push(`AR aging · As of ${asOf}`)
    out.push('')
    out.push(csvRow(['Invoice', 'Client', 'Project', 'Status', 'Sent', 'Days out', 'Bucket', 'Total', 'Paid', 'Outstanding']))
    for (const r of rows) {
      out.push(
        csvRow([
          r.invoice_number_display,
          r.client_name ?? '',
          r.project_name,
          r.status,
          r.sent_at ?? '',
          r.days_outstanding,
          BUCKET_LABEL[r.bucket],
          dollars(r.total_cents),
          dollars(r.paid_cents),
          dollars(r.outstanding_cents),
        ]),
      )
    }
    const total = rows.reduce((a, r) => a + r.outstanding_cents, 0)
    out.push('')
    out.push(csvRow(['', '', '', '', '', '', 'Total', '', '', dollars(total)]))
    return csvResponse(`hejmae-aging_${asOf}.csv`, csvBody(out))
  })
}

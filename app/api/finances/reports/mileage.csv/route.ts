import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'
import type { MileageLogRow } from '@/lib/supabase/types'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const yr = parseInt(url.searchParams.get('year') ?? '', 10)
    const taxYear = Number.isFinite(yr) ? yr : new Date().getUTCFullYear()
    const yearStart = `${taxYear}-01-01`
    const yearEnd = `${taxYear}-12-31`

    const sb = supabaseAdmin()
    const [{ data: trips }, { data: projects }] = await Promise.all([
      sb
        .from('mileage_log')
        .select('*')
        .eq('designer_id', ctx.designerId)
        .gte('trip_date', yearStart)
        .lte('trip_date', yearEnd)
        .order('trip_date', { ascending: true }),
      sb.from('projects').select('id, name').eq('designer_id', ctx.designerId),
    ])
    const projIx = new Map((projects ?? []).map((p) => [p.id, p]))

    const rows: string[] = []
    rows.push(`Mileage log · ${taxYear}`)
    rows.push('Use with IRS Form 4562 (Part V) or Schedule C line 9.')
    rows.push('')
    rows.push(
      csvRow([
        'Date',
        'Purpose',
        'From',
        'To',
        'Project',
        'Miles',
        'Rate (cents/mi)',
        'Deduction',
      ]),
    )
    let totalMiles = 0
    let totalAmount = 0
    for (const t of (trips ?? []) as MileageLogRow[]) {
      totalMiles += Number(t.miles)
      totalAmount += t.amount_cents
      rows.push(
        csvRow([
          t.trip_date,
          t.purpose ?? '',
          t.from_location ?? '',
          t.to_location ?? '',
          t.project_id ? projIx.get(t.project_id)?.name ?? '' : 'Studio',
          Number(t.miles).toFixed(1),
          t.rate_cents_per_mile,
          dollars(t.amount_cents),
        ]),
      )
    }
    rows.push('')
    rows.push(
      csvRow(['', '', '', '', 'Total', totalMiles.toFixed(1), '', dollars(totalAmount)]),
    )
    return csvResponse(`hejmae-mileage_${taxYear}.csv`, csvBody(rows))
  })
}

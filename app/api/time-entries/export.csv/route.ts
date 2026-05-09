import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { hasPermission, requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { listTimeEntries } from '@/lib/finances/time_entries'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'time:log')
    const url = new URL(req.url)
    const yr = parseInt(url.searchParams.get('year') ?? '', 10)
    const taxYear = Number.isFinite(yr) ? yr : new Date().getUTCFullYear()
    const yearStart = `${taxYear}-01-01`
    const yearEnd = `${taxYear}-12-31`
    const userId = hasPermission(ctx, 'time:view_all') ? null : ctx.userId

    const entries = await listTimeEntries(ctx.designerId, {
      from: yearStart,
      to: yearEnd,
      user_id: userId,
    })

    const sb = supabaseAdmin()
    const [{ data: projects }, { data: users }] = await Promise.all([
      sb.from('projects').select('id, name').eq('designer_id', ctx.designerId),
      sb.from('users').select('id, name, email'),
    ])
    const projIx = new Map((projects ?? []).map((p) => [p.id, p]))
    const userIx = new Map((users ?? []).map((u) => [u.id, u]))

    const rows: string[] = []
    rows.push(`Time entries · ${taxYear}`)
    rows.push('')
    rows.push(
      csvRow([
        'Date',
        'Member',
        'Project',
        'Description',
        'Started',
        'Ended',
        'Hours',
        'Billable',
        'Rate ($/hr)',
        'Amount',
        'Invoiced',
      ]),
    )
    let totalHours = 0
    let totalAmount = 0
    for (const e of entries) {
      const minutes = e.duration_minutes ?? 0
      const hours = minutes / 60
      const amount = Math.round(hours * e.hourly_rate_cents)
      totalHours += hours
      if (e.billable) totalAmount += amount
      const u = e.user_id ? userIx.get(e.user_id) : null
      rows.push(
        csvRow([
          e.started_at.slice(0, 10),
          u?.name ?? u?.email ?? '',
          projIx.get(e.project_id)?.name ?? '',
          e.description,
          e.started_at,
          e.ended_at ?? '',
          hours.toFixed(2),
          e.billable ? 'yes' : 'no',
          dollars(e.hourly_rate_cents),
          dollars(amount),
          e.invoice_line_item_id ? 'yes' : 'no',
        ]),
      )
    }
    rows.push('')
    rows.push(
      csvRow([
        '',
        '',
        '',
        '',
        '',
        '',
        totalHours.toFixed(2),
        '',
        '',
        dollars(totalAmount),
        '',
      ]),
    )
    return csvResponse(`hejmae-time_${taxYear}.csv`, csvBody(rows))
  })
}

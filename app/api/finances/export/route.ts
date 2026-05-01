// CSV export of all transactions for accountant / tax prep.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()

    const { data: invoices, error } = await sb
      .from('invoices')
      .select('id, project_id, type, status, total_cents, sent_at, paid_at, created_at')
      .eq('designer_id', designerId)
    if (error) throw error
    const { data: payments, error: e2 } = await sb
      .from('payments')
      .select('id, invoice_id, amount_cents, platform_fee_cents, received_at')
      .eq('designer_id', designerId)
    if (e2) throw e2

    const rows: string[] = [
      ['type', 'id', 'project_id', 'related_id', 'amount_cents', 'status', 'date'].join(','),
    ]
    for (const i of invoices ?? []) {
      rows.push(
        [
          'invoice',
          i.id,
          i.project_id,
          '',
          i.total_cents,
          i.status,
          i.sent_at ?? i.created_at,
        ]
          .map(csvCell)
          .join(','),
      )
    }
    for (const p of payments ?? []) {
      rows.push(
        ['payment', p.id, '', p.invoice_id, p.amount_cents, '', p.received_at]
          .map(csvCell)
          .join(','),
      )
    }
    const body = rows.join('\n') + '\n'
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="hejmae-export.csv"',
      },
    })
  })
}

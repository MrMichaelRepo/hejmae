// Per-invoice aging detail. Returns every unpaid (or partially paid)
// invoice as of `asOf`, with days-outstanding, the bucket it falls into,
// and the amount outstanding.

import { supabaseAdmin } from '@/lib/supabase/server'
import { bucketAge } from './period'

export interface AgingInvoiceRow {
  invoice_id: string
  invoice_number_display: string  // "Project · Type"
  client_name: string | null
  project_id: string
  project_name: string
  status: string
  total_cents: number
  paid_cents: number
  outstanding_cents: number
  sent_at: string | null
  days_outstanding: number
  bucket: 'current_cents' | 'bucket_31_60_cents' | 'bucket_61_90_cents' | 'bucket_over_90_cents'
}

export async function getAgingDetail(
  designerId: string,
  asOf: string,
): Promise<AgingInvoiceRow[]> {
  const sb = supabaseAdmin()
  const [{ data: invoices }, { data: payments }, { data: projects }, { data: clients }] =
    await Promise.all([
      sb
        .from('invoices')
        .select('id, project_id, type, status, total_cents, sent_at, created_at')
        .eq('designer_id', designerId),
      sb
        .from('payments')
        .select('invoice_id, amount_cents, received_at')
        .eq('designer_id', designerId)
        .lte('received_at', asOf + 'T23:59:59.999Z'),
      sb.from('projects').select('id, name, client_id').eq('designer_id', designerId),
      sb.from('clients').select('id, name').eq('designer_id', designerId),
    ])

  const projIx = new Map((projects ?? []).map((p) => [p.id, p]))
  const clientIx = new Map((clients ?? []).map((c) => [c.id, c]))

  const paidByInvoice = new Map<string, number>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    paidByInvoice.set(
      p.invoice_id,
      (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount_cents,
    )
  }

  const asOfMs = new Date(asOf + 'T00:00:00Z').getTime()
  const out: AgingInvoiceRow[] = []
  for (const inv of invoices ?? []) {
    if (inv.status === 'draft' || inv.status === 'paid') continue
    const sent = inv.sent_at ?? inv.created_at
    if (!sent) continue
    const sentDay = sent.slice(0, 10)
    if (sentDay > asOf) continue
    const outstanding = Math.max(0, inv.total_cents - (paidByInvoice.get(inv.id) ?? 0))
    if (outstanding === 0) continue
    const days = Math.max(
      0,
      Math.floor((asOfMs - new Date(sentDay + 'T00:00:00Z').getTime()) / 86_400_000),
    )
    const proj = projIx.get(inv.project_id)
    const client = proj?.client_id ? clientIx.get(proj.client_id) : null
    out.push({
      invoice_id: inv.id,
      invoice_number_display: `${proj?.name ?? '—'} · ${inv.type}`,
      client_name: client?.name ?? null,
      project_id: inv.project_id,
      project_name: proj?.name ?? '—',
      status: inv.status,
      total_cents: inv.total_cents,
      paid_cents: paidByInvoice.get(inv.id) ?? 0,
      outstanding_cents: outstanding,
      sent_at: sentDay,
      days_outstanding: days,
      bucket: bucketAge(days),
    })
  }
  // Sort: oldest first (most overdue at top).
  out.sort((a, b) => b.days_outstanding - a.days_outstanding)
  return out
}

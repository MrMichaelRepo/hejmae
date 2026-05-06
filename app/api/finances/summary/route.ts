// Studio-wide financial summary across all projects.
// Numbers are derived from invoices + payments + PO line items, not stored.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:view')
    const sb = supabaseAdmin()

    const [{ data: invoices, error: e1 }, { data: payments, error: e2 }, { data: poLines, error: e3 }] =
      await Promise.all([
        sb
          .from('invoices')
          .select('id, status, total_cents')
          .eq('designer_id', designerId),
        sb
          .from('payments')
          .select('invoice_id, amount_cents')
          .eq('designer_id', designerId),
        sb
          .from('purchase_order_line_items')
          .select('total_trade_price_cents')
          .eq('designer_id', designerId),
      ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3

    const totalInvoiced =
      invoices
        ?.filter((i) => i.status !== 'draft')
        .reduce((a, i) => a + i.total_cents, 0) ?? 0
    const totalReceived =
      payments?.reduce((a, p) => a + p.amount_cents, 0) ?? 0
    const paidByInvoice = new Map<string, number>()
    for (const p of payments ?? []) {
      if (!p.invoice_id) continue
      paidByInvoice.set(
        p.invoice_id,
        (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount_cents,
      )
    }
    const totalOutstanding =
      invoices
        ?.filter((i) => i.status === 'sent' || i.status === 'partially_paid')
        .reduce(
          (a, i) => a + Math.max(0, i.total_cents - (paidByInvoice.get(i.id) ?? 0)),
          0,
        ) ?? 0
    const totalCogs =
      poLines?.reduce((a, l) => a + l.total_trade_price_cents, 0) ?? 0

    const grossProfit = totalReceived - totalCogs
    const grossMarginPct =
      totalReceived > 0 ? (grossProfit / totalReceived) * 100 : null

    return NextResponse.json({
      data: {
        total_invoiced_cents: totalInvoiced,
        total_received_cents: totalReceived,
        total_outstanding_cents: totalOutstanding,
        total_cogs_cents: totalCogs,
        gross_profit_cents: grossProfit,
        gross_margin_pct: grossMarginPct,
      },
    })
  })
}
